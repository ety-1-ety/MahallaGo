-- ─────────────────────────────────────────────────────────────────
-- catalog.products: уникальность товара по (shop_id, normalized_name)
-- среди АКТИВНЫХ.
--
-- Цель — отбросить дубликаты, создаваемые при повторных нажатиях
-- "➕ Добавить товар". Скрытые товары (is_active = FALSE) не учитываем,
-- чтобы продавец мог скрыть товар и создать новый с тем же именем.
--
-- Перед созданием индекса физически удаляем существующие дубликаты,
-- иначе CREATE UNIQUE INDEX упадёт.
-- ─────────────────────────────────────────────────────────────────

-- 1) Дедупликация: оставляем самый ранний id для каждой группы
--    (shop_id, normalized_name, is_active).
DELETE FROM catalog.products
 WHERE id NOT IN (
   SELECT DISTINCT ON (shop_id, lower(trim(name)), is_active) id
     FROM catalog.products
     ORDER BY shop_id, lower(trim(name)), is_active, created_at
 );

-- 2) Партиальный уникальный индекс.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_shop_name_active
  ON catalog.products (shop_id, lower(trim(name)))
  WHERE is_active = TRUE;

COMMENT ON INDEX catalog.uniq_products_shop_name_active IS
  'Не разрешает двум активным товарам в одном магазине иметь одинаковое имя (case- и whitespace-insensitive). Скрытые товары не учитываются.';
