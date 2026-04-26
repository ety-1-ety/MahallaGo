-- ─────────────────────────────────────────────────────────────────
-- Модуль SHOPS — функции
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- shops.register
-- Создаёт магазин со статусом pending_approval. Вызывается seller-bot
-- по завершении 6-шагового онбординга.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.register(
  p_owner_id            UUID,
  p_name                TEXT,
  p_category            TEXT,
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
  v_slug TEXT;
  v_shop shops.shops;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SHOP_NAME';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SHOP_PHONE';
  END IF;

  -- slug = транслит лайт + 8-символьный хвост uuid (упрощённо: lowercase + replace)
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Zа-яА-Я0-9]+', '-', 'g'))
            || '-' || substr(uuid_generate_v4()::TEXT, 1, 8);

  INSERT INTO shops.shops (
    owner_id, name, slug, category, description, photo_file_id,
    phone, address, location, working_hours, timezone, status
  )
  VALUES (
    p_owner_id, trim(p_name), v_slug, p_category, p_description, p_photo_file_id,
    p_phone, p_address,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
    p_working_hours, p_timezone, 'pending_approval'
  )
  RETURNING * INTO v_shop;

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.register IS 'Регистрация нового магазина продавцом. Создаётся в статусе pending_approval';


-- ─────────────────────────────────────────────────────────────────
-- shops.find_nearby
-- Ищет активные магазины в радиусе вокруг координаты покупателя.
-- Возвращает магазины + расстояние в метрах, отсортированные по близости.
-- ─────────────────────────────────────────────────────────────────
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
    AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
          p_radius_m
        )
  ORDER BY distance_m ASC
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION shops.find_nearby IS 'Активные магазины вокруг координаты покупателя, отсортированные по расстоянию';


-- ─────────────────────────────────────────────────────────────────
-- shops.approve
-- Одобрить магазин. Меняет статус на active и логирует действие.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.approve(
  p_shop_id  UUID,
  p_actor_id UUID
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev shops.shop_status;
  v_shop shops.shops;
BEGIN
  SELECT status INTO v_prev FROM shops.shops WHERE id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  IF v_prev = 'active' THEN
    RAISE EXCEPTION 'SHOP_ALREADY_ACTIVE';
  END IF;

  UPDATE shops.shops
     SET status           = 'active',
         rejection_reason = NULL,
         approved_at      = NOW(),
         approved_by      = p_actor_id,
         updated_at       = NOW()
   WHERE id = p_shop_id
   RETURNING * INTO v_shop;

  INSERT INTO shops.moderation_log (shop_id, actor_id, action, prev_status, new_status, reason)
  VALUES (p_shop_id, p_actor_id, 'approve', v_prev, 'active', NULL);

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.approve IS 'Одобрить магазин (модератор). Записывает в moderation_log';


-- ─────────────────────────────────────────────────────────────────
-- shops.reject
-- Отклонить магазин с причиной.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.reject(
  p_shop_id  UUID,
  p_actor_id UUID,
  p_reason   TEXT
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev shops.shop_status;
  v_shop shops.shops;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
  END IF;

  SELECT status INTO v_prev FROM shops.shops WHERE id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  UPDATE shops.shops
     SET status           = 'rejected',
         rejection_reason = p_reason,
         updated_at       = NOW()
   WHERE id = p_shop_id
   RETURNING * INTO v_shop;

  INSERT INTO shops.moderation_log (shop_id, actor_id, action, prev_status, new_status, reason)
  VALUES (p_shop_id, p_actor_id, 'reject', v_prev, 'rejected', p_reason);

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.reject IS 'Отклонить магазин с обязательной причиной (модератор)';


-- ─────────────────────────────────────────────────────────────────
-- shops.suspend
-- Временно заблокировать магазин (за нарушения).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.suspend(
  p_shop_id  UUID,
  p_actor_id UUID,
  p_reason   TEXT
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev shops.shop_status;
  v_shop shops.shops;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'SUSPEND_REASON_REQUIRED';
  END IF;

  SELECT status INTO v_prev FROM shops.shops WHERE id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  UPDATE shops.shops
     SET status           = 'suspended',
         rejection_reason = p_reason,
         updated_at       = NOW()
   WHERE id = p_shop_id
   RETURNING * INTO v_shop;

  INSERT INTO shops.moderation_log (shop_id, actor_id, action, prev_status, new_status, reason)
  VALUES (p_shop_id, p_actor_id, 'suspend', v_prev, 'suspended', p_reason);

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.suspend IS 'Временно заблокировать магазин с указанием причины';


-- ─────────────────────────────────────────────────────────────────
-- shops.update_settings
-- Обновить настройки магазина (вызывается seller-bot из меню "Настройки").
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.update_settings(
  p_shop_id              UUID,
  p_min_order_amount     NUMERIC DEFAULT NULL,
  p_max_order_amount     NUMERIC DEFAULT NULL,
  p_delivery_fee         NUMERIC DEFAULT NULL,
  p_free_delivery_from   NUMERIC DEFAULT NULL,
  p_delivery_radius_m    INTEGER DEFAULT NULL,
  p_working_hours        JSONB   DEFAULT NULL,
  p_clear_max_order      BOOLEAN DEFAULT FALSE,
  p_clear_free_delivery  BOOLEAN DEFAULT FALSE
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shop shops.shops;
BEGIN
  UPDATE shops.shops
     SET
       min_order_amount   = COALESCE(p_min_order_amount,   min_order_amount),
       max_order_amount   = CASE
                              WHEN p_clear_max_order      THEN NULL
                              WHEN p_max_order_amount IS NOT NULL THEN p_max_order_amount
                              ELSE max_order_amount
                            END,
       delivery_fee       = COALESCE(p_delivery_fee,       delivery_fee),
       free_delivery_from = CASE
                              WHEN p_clear_free_delivery  THEN NULL
                              WHEN p_free_delivery_from IS NOT NULL THEN p_free_delivery_from
                              ELSE free_delivery_from
                            END,
       delivery_radius_m  = COALESCE(p_delivery_radius_m,  delivery_radius_m),
       working_hours      = COALESCE(p_working_hours,      working_hours),
       updated_at         = NOW()
   WHERE id = p_shop_id
   RETURNING * INTO v_shop;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  -- Валидация после применения
  IF v_shop.max_order_amount IS NOT NULL AND v_shop.max_order_amount < v_shop.min_order_amount THEN
    RAISE EXCEPTION 'MAX_ORDER_LESS_THAN_MIN';
  END IF;

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.update_settings IS 'Обновить настройки магазина. Используйте p_clear_max_order/p_clear_free_delivery для сброса в NULL';


-- ─────────────────────────────────────────────────────────────────
-- shops.toggle_accepting_orders
-- Переключить кнопку "Принимаю заказы" в seller-bot.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shops.toggle_accepting_orders(
  p_shop_id UUID,
  p_value   BOOLEAN
)
RETURNS shops.shops
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shop shops.shops;
BEGIN
  UPDATE shops.shops
     SET is_accepting_orders = p_value,
         updated_at          = NOW()
   WHERE id = p_shop_id
   RETURNING * INTO v_shop;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  RETURN v_shop;
END;
$$;

COMMENT ON FUNCTION shops.toggle_accepting_orders IS 'Переключить флаг is_accepting_orders из главного меню seller-bot';
