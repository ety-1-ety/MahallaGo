-- ─────────────────────────────────────────────────────────────────
-- Модуль SHOPS — триггеры
-- ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_shops_set_updated_at ON shops.shops;
CREATE TRIGGER trg_shops_set_updated_at
  BEFORE UPDATE ON shops.shops
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();

DROP TRIGGER IF EXISTS trg_moderation_log_set_updated_at ON shops.moderation_log;
CREATE TRIGGER trg_moderation_log_set_updated_at
  BEFORE UPDATE ON shops.moderation_log
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();
