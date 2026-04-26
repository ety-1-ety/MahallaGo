-- ─────────────────────────────────────────────────────────────────
-- Модуль CATALOG — представления
-- ─────────────────────────────────────────────────────────────────

-- Активные товары с информацией о магазине и категории
CREATE OR REPLACE VIEW catalog.v_active_products AS
SELECT
  p.id,
  p.shop_id,
  s.name        AS shop_name,
  s.slug        AS shop_slug,
  p.category_id,
  c.slug        AS category_slug,
  c.name_uz     AS category_name_uz,
  c.name_ru     AS category_name_ru,
  c.emoji       AS category_emoji,
  p.name,
  p.description,
  p.photo_file_id,
  p.price,
  p.stock,
  p.created_at,
  p.updated_at
FROM catalog.products p
JOIN shops.shops      s ON s.id = p.shop_id
LEFT JOIN catalog.categories c ON c.id = p.category_id
WHERE p.is_active = TRUE
  AND p.stock     > 0
  AND s.status    = 'active'
  AND s.is_accepting_orders = TRUE;

COMMENT ON VIEW catalog.v_active_products IS 'Активные товары активных магазинов с подтянутыми категорией и названием магазина';
