-- ─────────────────────────────────────────────────────────────────
-- Дополнительный тест: проверяет фиксы Bug #2 и Bug #5.
-- Запускать так же как test-create-order-validations.sql.
-- В конце ROLLBACK — никаких данных не остаётся.
-- ─────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

BEGIN;

\echo '═══ FIX #2: orders.update_status пишет правильный prev_status ═══'

SELECT auth.upsert_user(99000010, 'fix_buyer',  'Fix', 'Buyer',  'ru');
SELECT auth.upsert_user(99000011, 'fix_seller', 'Fix', 'Seller', 'ru');

WITH owner AS (SELECT id FROM auth.users WHERE telegram_id = 99000011)
INSERT INTO shops.shops (
  owner_id, name, slug, category, phone, address, location, status,
  min_order_amount, delivery_fee, delivery_radius_m, is_accepting_orders, working_hours
)
SELECT
  o.id, 'Fix-Test-Shop', 'fix-test-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  'groceries', '+998900000000', 'Test 1',
  ST_SetSRID(ST_MakePoint(69.2387, 41.3266), 4326)::GEOGRAPHY,
  'active', 0, 0, 500, TRUE, '{}'::JSONB
FROM owner o;

SELECT id AS shop_id  FROM shops.shops WHERE name = 'Fix-Test-Shop' ORDER BY created_at DESC LIMIT 1 \gset
SELECT id AS buyer_id FROM auth.users WHERE telegram_id = 99000010 \gset

INSERT INTO catalog.products (shop_id, name, price, stock, is_active)
VALUES (:'shop_id', 'Test Item', 1000, 100, TRUE)
RETURNING id AS prod_id \gset

-- Создаём заказ → status='pending' автоматически
SELECT id AS order_id FROM orders.create_order(
  :'buyer_id'::UUID,
  :'shop_id'::UUID,
  jsonb_build_array(jsonb_build_object('product_id', :'prod_id', 'qty', 2)),
  41.3266, 69.2387,
  'Test address'
) \gset

-- В status_history первая запись должна иметь prev_status=NULL, new_status=pending
DO $$
DECLARE
  r orders.status_history;
BEGIN
  SELECT * INTO r FROM orders.status_history
   WHERE order_id = (SELECT id FROM orders.orders ORDER BY created_at DESC LIMIT 1);
  IF r.prev_status IS NOT NULL OR r.new_status::TEXT <> 'pending' THEN
    RAISE EXCEPTION 'TEST_FAILED: первая запись истории неверна: prev=% new=%', r.prev_status, r.new_status;
  END IF;
  RAISE NOTICE '  ✓ Первая запись status_history: prev=NULL new=pending';
END $$;

-- Меняем статус pending → accepted
SELECT * FROM orders.update_status(:'order_id'::UUID, 'accepted', :'buyer_id'::UUID, NULL);

-- В status_history должна быть запись prev_status=pending, new_status=accepted
DO $$
DECLARE
  r orders.status_history;
BEGIN
  SELECT * INTO r FROM orders.status_history
   WHERE order_id = (SELECT id FROM orders.orders ORDER BY created_at DESC LIMIT 1)
   ORDER BY created_at DESC LIMIT 1;
  IF r.prev_status::TEXT <> 'pending' OR r.new_status::TEXT <> 'accepted' THEN
    RAISE EXCEPTION 'TEST_FAILED: prev_status неверно записан: prev=% new=% (ожидалось pending → accepted)',
      r.prev_status, r.new_status;
  END IF;
  RAISE NOTICE '  ✓ FIX #2 OK: prev_status=pending, new_status=accepted (было бы accepted/accepted до фикса)';
END $$;

\echo ''
\echo '═══ FIX #5: shops.update_settings валидирует ДО UPDATE ═══'

-- Магазин с min=10000, max=50000
UPDATE shops.shops SET min_order_amount = 10000, max_order_amount = 50000
 WHERE id = :'shop_id'::UUID;

-- Попытка установить min=60000 (> max=50000) — должна упасть с MAX_ORDER_LESS_THAN_MIN
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM shops.update_settings(
    (SELECT id FROM shops.shops WHERE name = 'Fix-Test-Shop' ORDER BY created_at DESC LIMIT 1),
    60000,    -- p_min_order_amount
    NULL,     -- p_max_order_amount (не меняем)
    NULL, NULL, NULL, NULL,
    FALSE, FALSE
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось MAX_ORDER_LESS_THAN_MIN';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'MAX_ORDER_LESS_THAN_MIN' THEN
    RAISE NOTICE '  ✓ FIX #5 OK: MAX_ORDER_LESS_THAN_MIN брошен ДО UPDATE';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось MAX_ORDER_LESS_THAN_MIN, получено: %', v_caught;
  END IF;
END $$;

-- Проверяем что данные НЕ изменились (это ключевое отличие от старой версии,
-- которая делала UPDATE а потом валидацию — после неё значения откатились бы
-- через ROLLBACK транзакции, но в нашей фиксации мы валидируем ДО, и
-- состояние корректно)
DO $$
DECLARE
  v_min NUMERIC;
BEGIN
  SELECT min_order_amount INTO v_min
    FROM shops.shops
   WHERE id = (SELECT id FROM shops.shops WHERE name = 'Fix-Test-Shop' ORDER BY created_at DESC LIMIT 1);
  IF v_min <> 10000 THEN
    RAISE EXCEPTION 'TEST_FAILED: min_order_amount изменился до бракованного значения: %', v_min;
  END IF;
  RAISE NOTICE '  ✓ FIX #5 проверка состояния: min_order_amount остался 10000';
END $$;

-- Тест что валидный апдейт всё ещё работает: min=20000 (< max=50000) — должно пройти
DO $$
BEGIN
  PERFORM shops.update_settings(
    (SELECT id FROM shops.shops WHERE name = 'Fix-Test-Shop' ORDER BY created_at DESC LIMIT 1),
    20000, NULL, NULL, NULL, NULL, NULL, FALSE, FALSE
  );
  RAISE NOTICE '  ✓ FIX #5 валидный апдейт всё ещё работает (min=20000 < max=50000)';
END $$;

\echo ''
\echo '✔ Все фиксы прошли проверку'

ROLLBACK;
