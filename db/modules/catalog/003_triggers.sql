-- ─────────────────────────────────────────────────────────────────
-- Модуль CATALOG — триггеры
-- ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_categories_set_updated_at ON catalog.categories;
CREATE TRIGGER trg_categories_set_updated_at
  BEFORE UPDATE ON catalog.categories
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON catalog.products;
CREATE TRIGGER trg_products_set_updated_at
  BEFORE UPDATE ON catalog.products
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();
