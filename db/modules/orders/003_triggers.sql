-- ─────────────────────────────────────────────────────────────────
-- Модуль ORDERS — триггеры
-- ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_orders_set_updated_at ON orders.orders;
CREATE TRIGGER trg_orders_set_updated_at
  BEFORE UPDATE ON orders.orders
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();

DROP TRIGGER IF EXISTS trg_order_items_set_updated_at ON orders.order_items;
CREATE TRIGGER trg_order_items_set_updated_at
  BEFORE UPDATE ON orders.order_items
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();

DROP TRIGGER IF EXISTS trg_status_history_set_updated_at ON orders.status_history;
CREATE TRIGGER trg_status_history_set_updated_at
  BEFORE UPDATE ON orders.status_history
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();
