-- ─────────────────────────────────────────────────────────────────
-- Модуль CATALOG — функции
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- catalog.add_product
-- Добавить товар в магазин (вызывается seller-bot из 5-шагового wizard).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.add_product(
  p_shop_id        UUID,
  p_category_id    UUID,
  p_name           TEXT,
  p_description    TEXT,
  p_photo_file_id  TEXT,
  p_price          NUMERIC,
  p_stock          INTEGER DEFAULT 0
)
RETURNS catalog.products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product catalog.products;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_NAME';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_PRICE';
  END IF;

  IF p_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_STOCK';
  END IF;

  INSERT INTO catalog.products (
    shop_id, category_id, name, description, photo_file_id, price, stock
  )
  VALUES (
    p_shop_id, p_category_id, trim(p_name), p_description, p_photo_file_id, p_price, p_stock
  )
  RETURNING * INTO v_product;

  RETURN v_product;
END;
$$;

COMMENT ON FUNCTION catalog.add_product IS 'Добавить новый товар в магазин';


-- ─────────────────────────────────────────────────────────────────
-- catalog.update_product
-- Обновить параметры товара. NULL-параметры не меняют существующее значение.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.update_product(
  p_product_id     UUID,
  p_category_id    UUID    DEFAULT NULL,
  p_name           TEXT    DEFAULT NULL,
  p_description    TEXT    DEFAULT NULL,
  p_photo_file_id  TEXT    DEFAULT NULL,
  p_price          NUMERIC DEFAULT NULL,
  p_stock          INTEGER DEFAULT NULL,
  p_is_active      BOOLEAN DEFAULT NULL
)
RETURNS catalog.products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product catalog.products;
BEGIN
  UPDATE catalog.products
     SET
       category_id   = COALESCE(p_category_id,   category_id),
       name          = COALESCE(NULLIF(trim(p_name), ''), name),
       description   = COALESCE(p_description,   description),
       photo_file_id = COALESCE(p_photo_file_id, photo_file_id),
       price         = COALESCE(p_price,         price),
       stock         = COALESCE(p_stock,         stock),
       is_active     = COALESCE(p_is_active,     is_active),
       updated_at    = NOW()
   WHERE id = p_product_id
   RETURNING * INTO v_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  RETURN v_product;
END;
$$;

COMMENT ON FUNCTION catalog.update_product IS 'Обновить товар. NULL-параметры не меняют значение';


-- ─────────────────────────────────────────────────────────────────
-- catalog.delete_product
-- Мягкое удаление: is_active=false. Физически не удаляем — для истории заказов.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.delete_product(p_product_id UUID)
RETURNS catalog.products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product catalog.products;
BEGIN
  UPDATE catalog.products
     SET is_active  = FALSE,
         stock      = 0,
         updated_at = NOW()
   WHERE id = p_product_id
   RETURNING * INTO v_product;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  RETURN v_product;
END;
$$;

COMMENT ON FUNCTION catalog.delete_product IS 'Мягкое удаление: is_active=false, stock=0. Запись остаётся для истории заказов';


-- ─────────────────────────────────────────────────────────────────
-- catalog.search_products
-- Поиск товаров в магазине по trigram-индексу.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.search_products(
  p_shop_id  UUID,
  p_query    TEXT,
  p_limit    INTEGER DEFAULT 20,
  p_offset   INTEGER DEFAULT 0
)
RETURNS SETOF catalog.products
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM catalog.products
  WHERE shop_id   = p_shop_id
    AND is_active = TRUE
    AND stock     > 0
    AND (p_query IS NULL OR length(trim(p_query)) = 0 OR name ILIKE '%' || p_query || '%')
  ORDER BY
    CASE WHEN p_query IS NULL OR length(trim(p_query)) = 0 THEN 0 ELSE similarity(name, p_query) END DESC,
    name ASC
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION catalog.search_products IS 'Поиск активных товаров в магазине. Пустой query вернёт все';


-- ─────────────────────────────────────────────────────────────────
-- catalog.list_by_category
-- Список товаров магазина в указанной категории, с пагинацией.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.list_by_category(
  p_shop_id     UUID,
  p_category_id UUID,
  p_page        INTEGER DEFAULT 1,
  p_per_page    INTEGER DEFAULT 10
)
RETURNS SETOF catalog.products
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM catalog.products
  WHERE shop_id     = p_shop_id
    AND is_active   = TRUE
    AND stock       > 0
    AND (p_category_id IS NULL OR category_id = p_category_id)
  ORDER BY name ASC
  LIMIT p_per_page OFFSET GREATEST((p_page - 1), 0) * p_per_page;
$$;

COMMENT ON FUNCTION catalog.list_by_category IS 'Постраничный список товаров магазина в категории. p_category_id=NULL — все категории';


-- ─────────────────────────────────────────────────────────────────
-- catalog.list_categories_with_counts
-- Для меню магазина в buyer-bot: категории с количеством активных товаров.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.list_categories_with_counts(p_shop_id UUID)
RETURNS TABLE (
  id           UUID,
  slug         TEXT,
  name_uz      TEXT,
  name_ru      TEXT,
  emoji        TEXT,
  sort_order   INTEGER,
  product_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.slug,
    c.name_uz,
    c.name_ru,
    c.emoji,
    c.sort_order,
    COUNT(p.id)::BIGINT AS product_count
  FROM catalog.categories c
  LEFT JOIN catalog.products p
    ON p.category_id = c.id
   AND p.shop_id     = p_shop_id
   AND p.is_active   = TRUE
   AND p.stock       > 0
  WHERE c.is_active = TRUE
  GROUP BY c.id, c.slug, c.name_uz, c.name_ru, c.emoji, c.sort_order
  HAVING COUNT(p.id) > 0
  ORDER BY c.sort_order ASC, c.name_uz ASC;
$$;

COMMENT ON FUNCTION catalog.list_categories_with_counts IS 'Категории, в которых у магазина есть активные товары, с их количеством';
