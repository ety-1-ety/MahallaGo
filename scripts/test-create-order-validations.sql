-- ─────────────────────────────────────────────────────────────────
-- Ручная проверка 6 валидаций orders.create_order
--
-- Запуск:
--   psql "$DATABASE_URL" -f scripts/test-create-order-validations.sql
--
-- Скрипт идемпотентен — все тестовые сущности удаляются и пересоздаются.
-- ─────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

BEGIN;

-- ─────────── 1. Подготовка ──────────────────────────────────────
-- Покупатель (тест)
SELECT auth.upsert_user(99000001, 'test_buyer', 'Test', 'Buyer', 'ru');

-- Продавец (тест)
SELECT auth.upsert_user(99000002, 'test_seller', 'Test', 'Seller', 'ru');

-- Магазин в Ташкенте (Чорсу): 41.3266, 69.2387
-- min=10000, max=200000, delivery_fee=5000, free_from=50000, radius=500m
-- working_hours='{}' = всегда открыт
WITH owner AS (
  SELECT id FROM auth.users WHERE telegram_id = 99000002
)
INSERT INTO shops.shops (
  owner_id, name, slug, category, phone, address, location, status,
  min_order_amount, max_order_amount, delivery_fee, free_delivery_from,
  delivery_radius_m, is_accepting_orders, working_hours
)
SELECT
  o.id, 'Test-Shop-A', 'test-shop-a-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  'groceries', '+998901112233', 'Тестовая 1',
  ST_SetSRID(ST_MakePoint(69.2387, 41.3266), 4326)::GEOGRAPHY,
  'active', 10000, 200000, 5000, 50000, 500, TRUE, '{}'::JSONB
FROM owner o
ON CONFLICT (slug) DO NOTHING;

-- Получим id магазина (последний из тестовых)
\set test_shop_query 'SELECT id FROM shops.shops WHERE name = ''Test-Shop-A'' ORDER BY created_at DESC LIMIT 1'

-- Сохраним id в psql переменные через \gset
SELECT id AS shop_id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1 \gset

SELECT id AS buyer_id FROM auth.users WHERE telegram_id = 99000001 \gset

-- Удалим прежние товары и создадим свежие
DELETE FROM catalog.products WHERE shop_id = :'shop_id';

INSERT INTO catalog.products (shop_id, name, price, stock, is_active)
VALUES
  (:'shop_id', 'Хлеб',  5000,  100, TRUE),
  (:'shop_id', 'Молоко', 12000, 100, TRUE),
  (:'shop_id', 'Яйца',  18000, 100, TRUE),
  (:'shop_id', 'Сахар', 15000, 0,   TRUE);  -- out of stock

SELECT id AS bread_id  FROM catalog.products WHERE shop_id = :'shop_id' AND name = 'Хлеб'  \gset
SELECT id AS milk_id   FROM catalog.products WHERE shop_id = :'shop_id' AND name = 'Молоко' \gset
SELECT id AS eggs_id   FROM catalog.products WHERE shop_id = :'shop_id' AND name = 'Яйца'   \gset
SELECT id AS sugar_id  FROM catalog.products WHERE shop_id = :'shop_id' AND name = 'Сахар'  \gset

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 0: успешный заказ (контрольный)'
\echo '─────────────────────────────────────────────────────────────'
-- 2 хлеба (10000) + 1 молоко (12000) = subtotal 22000
-- < free_delivery_from (50000) → delivery_fee = 5000
-- total = 27000
-- > min (10000), < max (200000)
-- distance ~ 0м, < radius 500
SELECT
  o.id,
  o.number,
  o.subtotal,
  o.delivery_fee,
  o.total,
  o.distance_m,
  o.status
FROM orders.create_order(
  :'buyer_id'::UUID,
  :'shop_id'::UUID,
  jsonb_build_array(
    jsonb_build_object('product_id', :'bread_id', 'qty', 2),
    jsonb_build_object('product_id', :'milk_id',  'qty', 1)
  ),
  41.3266, 69.2387,
  'Тестовая 2'
) o;

-- ─────────── ТЕСТЫ ОШИБОК ──────────────────────────────────────
-- Каждый тест ожидает конкретное исключение.
-- Используем DO $$ ... EXCEPTION WHEN OTHERS чтобы поймать и проверить SQLSTATE/MESSAGE.

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 1: SHOP_NOT_AVAILABLE (магазин suspended)'
\echo '─────────────────────────────────────────────────────────────'
UPDATE shops.shops SET status = 'suspended' WHERE id = :'shop_id';

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM orders.create_order(
    (SELECT id FROM auth.users WHERE telegram_id = 99000001),
    (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1),
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Хлеб' ORDER BY created_at DESC LIMIT 1), 'qty', 1)),
    41.3266, 69.2387, 'Тестовая 2'
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось исключение SHOP_NOT_AVAILABLE';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'SHOP_NOT_AVAILABLE' THEN
    RAISE NOTICE '  ✓ OK: SHOP_NOT_AVAILABLE';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось SHOP_NOT_AVAILABLE, получено: %', v_caught;
  END IF;
END $$;

-- Возвращаем магазин в active
UPDATE shops.shops SET status = 'active' WHERE id = :'shop_id';

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 2: OUT_OF_DELIVERY_RANGE (покупатель за 5км)'
\echo '─────────────────────────────────────────────────────────────'
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM orders.create_order(
    (SELECT id FROM auth.users WHERE telegram_id = 99000001),
    (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1),
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Хлеб' ORDER BY created_at DESC LIMIT 1), 'qty', 1)),
    41.4000, 69.3000,  -- ~10км от 41.3266, 69.2387
    'Далеко-далеко'
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось OUT_OF_DELIVERY_RANGE';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'OUT_OF_DELIVERY_RANGE' THEN
    RAISE NOTICE '  ✓ OK: OUT_OF_DELIVERY_RANGE';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось OUT_OF_DELIVERY_RANGE, получено: %', v_caught;
  END IF;
END $$;

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 3: BELOW_MIN_ORDER (1 хлеб = 5000 < min 10000)'
\echo '─────────────────────────────────────────────────────────────'
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM orders.create_order(
    (SELECT id FROM auth.users WHERE telegram_id = 99000001),
    (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1),
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Хлеб' ORDER BY created_at DESC LIMIT 1), 'qty', 1)),
    41.3266, 69.2387, 'Тестовая 2'
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось BELOW_MIN_ORDER';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'BELOW_MIN_ORDER' THEN
    RAISE NOTICE '  ✓ OK: BELOW_MIN_ORDER';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось BELOW_MIN_ORDER, получено: %', v_caught;
  END IF;
END $$;

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 4: ABOVE_MAX_ORDER (50 яиц = 900000 > max 200000)'
\echo '─────────────────────────────────────────────────────────────'
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM orders.create_order(
    (SELECT id FROM auth.users WHERE telegram_id = 99000001),
    (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1),
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Яйца' ORDER BY created_at DESC LIMIT 1), 'qty', 50)),
    41.3266, 69.2387, 'Тестовая 2'
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось ABOVE_MAX_ORDER';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'ABOVE_MAX_ORDER' THEN
    RAISE NOTICE '  ✓ OK: ABOVE_MAX_ORDER';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось ABOVE_MAX_ORDER, получено: %', v_caught;
  END IF;
END $$;

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 5: SHOP_CLOSED_NOW (working_hours - сегодня closed)'
\echo '─────────────────────────────────────────────────────────────'
-- Найдём день недели и поставим closed на него
DO $$
DECLARE
  v_keys  TEXT[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
  v_dow   INTEGER;
  v_today TEXT;
  v_shop_id UUID;
  v_caught TEXT;
BEGIN
  v_dow   := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Tashkent'))::INTEGER;
  v_today := v_keys[v_dow + 1];
  v_shop_id := (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1);

  UPDATE shops.shops
     SET working_hours = jsonb_build_object(v_today, jsonb_build_object('closed', TRUE))
   WHERE id = v_shop_id;

  BEGIN
    PERFORM orders.create_order(
      (SELECT id FROM auth.users WHERE telegram_id = 99000001),
      v_shop_id,
      jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Хлеб' AND shop_id = v_shop_id), 'qty', 2)),
      41.3266, 69.2387, 'Тестовая 2'
    );
    RAISE EXCEPTION 'TEST_FAILED: ожидалось SHOP_CLOSED_NOW';
  EXCEPTION WHEN OTHERS THEN
    v_caught := SQLERRM;
    IF v_caught = 'SHOP_CLOSED_NOW' THEN
      RAISE NOTICE '  ✓ OK: SHOP_CLOSED_NOW';
    ELSE
      RAISE EXCEPTION 'TEST_FAILED: ожидалось SHOP_CLOSED_NOW, получено: %', v_caught;
    END IF;
  END;

  -- Возвращаем working_hours='{}'
  UPDATE shops.shops SET working_hours = '{}'::JSONB WHERE id = v_shop_id;
END $$;

\echo '─────────────────────────────────────────────────────────────'
\echo 'TEST 6: ITEM_OUT_OF_STOCK (Сахар stock=0)'
\echo '─────────────────────────────────────────────────────────────'
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM orders.create_order(
    (SELECT id FROM auth.users WHERE telegram_id = 99000001),
    (SELECT id FROM shops.shops WHERE name = 'Test-Shop-A' ORDER BY created_at DESC LIMIT 1),
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM catalog.products WHERE name = 'Сахар' ORDER BY created_at DESC LIMIT 1), 'qty', 1)),
    41.3266, 69.2387, 'Тестовая 2'
  );
  RAISE EXCEPTION 'TEST_FAILED: ожидалось ITEM_OUT_OF_STOCK';
EXCEPTION WHEN OTHERS THEN
  v_caught := SQLERRM;
  IF v_caught = 'ITEM_OUT_OF_STOCK' THEN
    RAISE NOTICE '  ✓ OK: ITEM_OUT_OF_STOCK';
  ELSE
    RAISE EXCEPTION 'TEST_FAILED: ожидалось ITEM_OUT_OF_STOCK, получено: %', v_caught;
  END IF;
END $$;

\echo '─────────────────────────────────────────────────────────────'
\echo '✔ Все 6 валидаций + контрольный заказ — пройдено'
\echo '─────────────────────────────────────────────────────────────'

ROLLBACK;
