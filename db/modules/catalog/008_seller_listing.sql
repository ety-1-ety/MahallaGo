-- ─────────────────────────────────────────────────────────────────
-- CATALOG · функции для seller-bot «Мои товары»
--
-- Отличаются от buyer-функций тем, что НЕ фильтруют по stock > 0:
-- продавец должен видеть и товары с пустым остатком (чтобы пополнить).
-- is_active = TRUE сохраняем — скрытые товары не показываем.
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- catalog.list_categories_for_seller
-- Все категории, в которых у магазина есть активные товары + строка
-- для товаров без категории (id = NULL). Используется в Stage 1
-- меню «Мои товары».
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.list_categories_for_seller(p_shop_id UUID)
RETURNS TABLE (
  id            UUID,
  slug          TEXT,
  name_uz       TEXT,
  name_ru       TEXT,
  emoji         TEXT,
  sort_order    INTEGER,
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
  WHERE c.is_active = TRUE
  GROUP BY c.id, c.slug, c.name_uz, c.name_ru, c.emoji, c.sort_order
  HAVING COUNT(p.id) > 0

  UNION ALL

  -- Псевдо-«категория» для товаров без category_id. Возвращаем только если
  -- такие товары вообще есть, чтобы кнопка «Без категории» не появлялась впустую.
  SELECT
    NULL::UUID                  AS id,
    '__none__'::TEXT            AS slug,
    'Toifasiz'::TEXT            AS name_uz,
    'Без категории'::TEXT       AS name_ru,
    '🚫'::TEXT                  AS emoji,
    9999::INTEGER               AS sort_order,
    COUNT(*)::BIGINT            AS product_count
  FROM catalog.products
  WHERE shop_id     = p_shop_id
    AND is_active   = TRUE
    AND category_id IS NULL
  HAVING COUNT(*)   > 0

  ORDER BY sort_order ASC, name_ru ASC;
$$;

COMMENT ON FUNCTION catalog.list_categories_for_seller IS
  'Категории с активными товарами магазина + псевдо-категория «Без категории». Без stock-фильтра';


-- ─────────────────────────────────────────────────────────────────
-- catalog.count_products_for_seller
-- Сколько активных товаров у магазина с указанным фильтром.
-- Используется для расчёта total pages в пагинации.
--
-- Семантика category-параметров:
--   p_no_category=TRUE  → WHERE category_id IS NULL (фильтр «Без категории»)
--   p_category_id NOT NULL → WHERE category_id = p_category_id
--   оба NULL/FALSE → без фильтра по категории (все товары магазина)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.count_products_for_seller(
  p_shop_id      UUID,
  p_category_id  UUID    DEFAULT NULL,
  p_no_category  BOOLEAN DEFAULT FALSE,
  p_query        TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM catalog.products
  WHERE shop_id   = p_shop_id
    AND is_active = TRUE
    AND (
      (p_no_category AND category_id IS NULL)
      OR (NOT p_no_category AND p_category_id IS NOT NULL AND category_id = p_category_id)
      OR (NOT p_no_category AND p_category_id IS NULL)
    )
    AND (p_query IS NULL OR length(trim(p_query)) = 0 OR name ILIKE '%' || p_query || '%');
$$;

COMMENT ON FUNCTION catalog.count_products_for_seller IS
  'Количество активных товаров магазина с фильтрами по категории и подстроке имени';


-- ─────────────────────────────────────────────────────────────────
-- catalog.list_products_for_seller
-- Постраничный список товаров продавца с теми же фильтрами что и
-- count_products_for_seller. Сортировка: по имени (стабильная для пагинации).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalog.list_products_for_seller(
  p_shop_id      UUID,
  p_category_id  UUID    DEFAULT NULL,
  p_no_category  BOOLEAN DEFAULT FALSE,
  p_query        TEXT    DEFAULT NULL,
  p_page         INTEGER DEFAULT 1,
  p_per_page     INTEGER DEFAULT 8
)
RETURNS SETOF catalog.products
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM catalog.products
  WHERE shop_id   = p_shop_id
    AND is_active = TRUE
    AND (
      (p_no_category AND category_id IS NULL)
      OR (NOT p_no_category AND p_category_id IS NOT NULL AND category_id = p_category_id)
      OR (NOT p_no_category AND p_category_id IS NULL)
    )
    AND (p_query IS NULL OR length(trim(p_query)) = 0 OR name ILIKE '%' || p_query || '%')
  ORDER BY name ASC, id ASC
  LIMIT  p_per_page
  OFFSET GREATEST((p_page - 1), 0) * p_per_page;
$$;

COMMENT ON FUNCTION catalog.list_products_for_seller IS
  'Постраничный список товаров для seller-bot «Мои товары». Без stock-фильтра';
