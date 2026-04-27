-- ─────────────────────────────────────────────────────────────────
-- Миграция 007: Multi-категории магазина + delivery_radius_m фильтр
--
-- Зачем здесь, а не в shops/?
--   shops.shop_categories ссылается на catalog.categories — её нельзя
--   создать в shops/* (модуль shops применяется ДО catalog по
--   MODULE_ORDER в db/_runner.js). Поэтому таблица + переопределение
--   функций живут в catalog/007.
--
-- Что меняется:
--   1. Создаётся shops.shop_categories (M:N связь магазин ↔ категория).
--   2. Backfill: для существующих магазинов с slug в shops.shops.category
--      кладём связь в shop_categories.
--   3. shops.register получает новую сигнатуру с p_category_slugs TEXT[],
--      проверяет их существование, заполняет shops.shops.category первой
--      категорией (для обратной совместимости) и shop_categories — всеми.
--   4. shops.find_nearby:
--        • возвращает дополнительное поле categories TEXT[]
--        • фильтрует магазины по их собственному delivery_radius_m
--          (т.е. покупатель видит только те магазины, в чью зону
--           доставки попадает его геолокация).
--   5. Views v_pending_moderation и v_shop_detail — получают categories.
-- ─────────────────────────────────────────────────────────────────

-- 1) Таблица связи
CREATE TABLE IF NOT EXISTS shops.shop_categories (
  shop_id      UUID         NOT NULL REFERENCES shops.shops(id)        ON DELETE CASCADE,
  category_id  UUID         NOT NULL REFERENCES catalog.categories(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, category_id)
);

COMMENT ON TABLE  shops.shop_categories             IS 'Связка магазин→категория. Магазин может относиться к нескольким (овощи + молочка + хлеб)';
COMMENT ON COLUMN shops.shop_categories.shop_id     IS 'Магазин';
COMMENT ON COLUMN shops.shop_categories.category_id IS 'Глобальная категория из catalog.categories';
COMMENT ON COLUMN shops.shop_categories.created_at  IS 'Когда категория была привязана';

CREATE INDEX IF NOT EXISTS idx_shop_categories_category
  ON shops.shop_categories (category_id);

-- 2) Backfill из shops.shops.category (старая single-slug колонка)
INSERT INTO shops.shop_categories (shop_id, category_id)
SELECT s.id, c.id
  FROM shops.shops s
  JOIN catalog.categories c ON c.slug = s.category
 WHERE s.category IS NOT NULL
ON CONFLICT (shop_id, category_id) DO NOTHING;


-- 3) shops.register — новая сигнатура (TEXT → TEXT[])
DROP FUNCTION IF EXISTS shops.register(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, TEXT);

CREATE OR REPLACE FUNCTION shops.register(
  p_owner_id            UUID,
  p_name                TEXT,
  p_category_slugs      TEXT[],
  p_description         TEXT,
  p_photo_file_id       TEXT,
  p_phone               TEXT,
  p_address             TEXT,
  p_lat                 DOUBLE PRECISION,
  p_lng                 DOUBLE PRECISION,
  p_working_hours       JSONB DEFAULT '{}'::JSONB,
  p_timezone            TEXT  DEFAULT 'Asia/Tashkent'
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug          TEXT;
  v_primary_slug  TEXT;
  v_shop          shops.shops;
  v_cat_count     INTEGER;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SHOP_NAME';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SHOP_PHONE';
  END IF;

  IF p_category_slugs IS NULL OR array_length(p_category_slugs, 1) IS NULL THEN
    RAISE EXCEPTION 'CATEGORY_REQUIRED';
  END IF;

  -- Все ли slug-и существуют и активны?
  SELECT COUNT(*) INTO v_cat_count
    FROM catalog.categories
   WHERE slug = ANY(p_category_slugs) AND is_active = TRUE;
  IF v_cat_count <> array_length(p_category_slugs, 1) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY_SLUG';
  END IF;

  v_primary_slug := p_category_slugs[1];

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Zа-яА-Я0-9]+', '-', 'g'))
            || '-' || substr(uuid_generate_v4()::TEXT, 1, 8);

  INSERT INTO shops.shops (
    owner_id, name, slug, category, description, photo_file_id,
    phone, address, location, working_hours, timezone, status
  )
  VALUES (
    p_owner_id, trim(p_name), v_slug, v_primary_slug, p_description, p_photo_file_id,
    p_phone, p_address,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
    p_working_hours, p_timezone, 'pending_approval'
  )
  RETURNING * INTO v_shop;

  INSERT INTO shops.shop_categories (shop_id, category_id)
  SELECT v_shop.id, c.id
    FROM catalog.categories c
   WHERE c.slug = ANY(p_category_slugs);

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.register(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, TEXT)
  IS 'Регистрация нового магазина. p_category_slugs[] — массив slug-ов; первый = primary';


-- 4) shops.find_nearby — поле categories + фильтр по delivery_radius_m
DROP FUNCTION IF EXISTS shops.find_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION shops.find_nearby(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_m  INTEGER DEFAULT 2000,
  p_limit     INTEGER DEFAULT 20,
  p_offset    INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                  UUID,
  owner_id            UUID,
  name                TEXT,
  slug                TEXT,
  category            TEXT,
  categories          TEXT[],
  description         TEXT,
  photo_file_id       TEXT,
  phone               TEXT,
  address             TEXT,
  min_order_amount    NUMERIC(15,2),
  max_order_amount    NUMERIC(15,2),
  delivery_fee        NUMERIC(15,2),
  free_delivery_from  NUMERIC(15,2),
  delivery_radius_m   INTEGER,
  working_hours       JSONB,
  timezone            TEXT,
  distance_m          DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.slug,
    s.category,
    COALESCE(
      ARRAY(
        SELECT c.slug
          FROM shops.shop_categories sc
          JOIN catalog.categories c ON c.id = sc.category_id
         WHERE sc.shop_id = s.id
         ORDER BY c.sort_order
      ),
      ARRAY[]::TEXT[]
    ) AS categories,
    s.description,
    s.photo_file_id,
    s.phone,
    s.address,
    s.min_order_amount,
    s.max_order_amount,
    s.delivery_fee,
    s.free_delivery_from,
    s.delivery_radius_m,
    s.working_hours,
    s.timezone,
    ST_Distance(
      s.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY
    ) AS distance_m
  FROM shops.shops s
  WHERE s.status = 'active'
    AND s.is_accepting_orders = TRUE
    -- Глобальный UI-лимит (например «не дальше 2 км»)
    AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
          p_radius_m
        )
    -- Магазин показывается ТОЛЬКО если покупатель в его зоне доставки.
    -- Иначе клиенту нет смысла его видеть — заказ всё равно отвалится
    -- по OUT_OF_DELIVERY_RANGE в orders.create_order.
    AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
          s.delivery_radius_m
        )
  ORDER BY distance_m ASC
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION shops.find_nearby IS 'Активные магазины, в зону доставки которых попадает покупатель. Включает массив categories';


-- 5) Views с массивом categories.
-- ВАЖНО: PostgreSQL не разрешает CREATE OR REPLACE VIEW переименовывать
-- или вставлять колонку в середину; добавлять можно только в КОНЕЦ.
-- Поэтому categories идёт после всех существующих столбцов.
CREATE OR REPLACE VIEW shops.v_pending_moderation AS
SELECT
  s.id,
  s.name,
  s.slug,
  s.category,
  s.description,
  s.photo_file_id,
  s.phone,
  s.address,
  ST_Y(s.location::GEOMETRY) AS lat,
  ST_X(s.location::GEOMETRY) AS lng,
  s.working_hours,
  s.timezone,
  s.created_at,
  u.id            AS owner_id,
  u.telegram_id   AS owner_telegram_id,
  u.username      AS owner_username,
  u.first_name    AS owner_first_name,
  u.last_name     AS owner_last_name,
  u.phone         AS owner_phone,
  COALESCE(
    ARRAY(
      SELECT c.slug
        FROM shops.shop_categories sc
        JOIN catalog.categories c ON c.id = sc.category_id
       WHERE sc.shop_id = s.id
       ORDER BY c.sort_order
    ),
    ARRAY[]::TEXT[]
  ) AS categories
FROM shops.shops s
JOIN auth.users  u ON u.id = s.owner_id
WHERE s.status = 'pending_approval'
ORDER BY s.created_at ASC;


CREATE OR REPLACE VIEW shops.v_shop_detail AS
SELECT
  s.*,
  ST_Y(s.location::GEOMETRY) AS lat,
  ST_X(s.location::GEOMETRY) AS lng,
  u.telegram_id   AS owner_telegram_id,
  u.username      AS owner_username,
  u.first_name    AS owner_first_name,
  u.last_name     AS owner_last_name,
  u.phone         AS owner_phone,
  approver.username   AS approved_by_username,
  approver.first_name AS approved_by_first_name,
  COALESCE(
    ARRAY(
      SELECT c.slug
        FROM shops.shop_categories sc
        JOIN catalog.categories c ON c.id = sc.category_id
       WHERE sc.shop_id = s.id
       ORDER BY c.sort_order
    ),
    ARRAY[]::TEXT[]
  ) AS categories
FROM shops.shops s
JOIN auth.users  u        ON u.id = s.owner_id
LEFT JOIN auth.users approver ON approver.id = s.approved_by;
