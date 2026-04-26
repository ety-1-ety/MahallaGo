-- ─────────────────────────────────────────────────────────────────
-- Модуль ORDERS — функции
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- orders._is_shop_open_now
-- Внутренняя функция: открыт ли магазин в текущий момент по working_hours.
-- Формат working_hours JSONB:
--   {"mon":{"open":"09:00","close":"22:00"}, ..., "sun":{"closed":true}}
-- Если working_hours = '{}' — считаем что магазин всегда открыт.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders._is_shop_open_now(
  p_working_hours JSONB,
  p_timezone      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_now    TIMESTAMP;
  v_dow    INTEGER;
  v_key    TEXT;
  v_today  JSONB;
  v_open   TIME;
  v_close  TIME;
  v_now_t  TIME;
  v_keys   TEXT[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
BEGIN
  IF p_working_hours IS NULL OR p_working_hours = '{}'::JSONB THEN
    RETURN TRUE;
  END IF;

  v_now   := (NOW() AT TIME ZONE COALESCE(p_timezone, 'Asia/Tashkent'))::TIMESTAMP;
  v_dow   := EXTRACT(DOW FROM v_now)::INTEGER;
  v_key   := v_keys[v_dow + 1];
  v_today := p_working_hours -> v_key;

  IF v_today IS NULL THEN
    RETURN TRUE;  -- день не указан — считаем открытым
  END IF;

  IF (v_today ->> 'closed')::BOOLEAN IS TRUE THEN
    RETURN FALSE;
  END IF;

  v_open  := (v_today ->> 'open')::TIME;
  v_close := (v_today ->> 'close')::TIME;
  IF v_open IS NULL OR v_close IS NULL THEN
    RETURN TRUE;
  END IF;

  v_now_t := v_now::TIME;

  -- Учёт ночных смен (close < open означает переход через полночь)
  IF v_close > v_open THEN
    RETURN v_now_t >= v_open AND v_now_t < v_close;
  ELSE
    RETURN v_now_t >= v_open OR v_now_t < v_close;
  END IF;
END;
$$;

COMMENT ON FUNCTION orders._is_shop_open_now IS 'Открыт ли магазин в текущий момент по working_hours. Формат: {"mon":{"open":"09:00","close":"22:00"}}';


-- ─────────────────────────────────────────────────────────────────
-- orders.create_order
-- АТОМАРНОЕ создание заказа со ВСЕМИ 6 проверками.
--
-- Параметр p_items — JSONB-массив вида:
--   [{"product_id": "<uuid>", "qty": 2}, ...]
--
-- При любой ошибке RAISE EXCEPTION с одним из кодов:
--   SHOP_NOT_AVAILABLE, OUT_OF_DELIVERY_RANGE, BELOW_MIN_ORDER,
--   ABOVE_MAX_ORDER, SHOP_CLOSED_NOW, ITEM_OUT_OF_STOCK
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders.create_order(
  p_buyer_id          UUID,
  p_shop_id           UUID,
  p_items             JSONB,
  p_delivery_lat      DOUBLE PRECISION,
  p_delivery_lng      DOUBLE PRECISION,
  p_delivery_address  TEXT,
  p_notes             TEXT  DEFAULT NULL,
  p_payment_method    orders.payment_method DEFAULT 'cash'
)
RETURNS orders.orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shop                shops.shops;
  v_distance_m          DOUBLE PRECISION;
  v_subtotal            NUMERIC(15,2) := 0;
  v_effective_delivery  NUMERIC(15,2);
  v_total               NUMERIC(15,2);
  v_item                JSONB;
  v_product             catalog.products;
  v_qty                 INTEGER;
  v_line_total          NUMERIC(15,2);
  v_order               orders.orders;
  v_delivery_geog       GEOGRAPHY(POINT, 4326);
BEGIN
  -- ─── 0. Базовые проверки входных параметров ──────────────────
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  IF p_delivery_address IS NULL OR length(trim(p_delivery_address)) = 0 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_ADDRESS';
  END IF;

  v_delivery_geog := ST_SetSRID(ST_MakePoint(p_delivery_lng, p_delivery_lat), 4326)::GEOGRAPHY;

  -- ─── 1. Магазин существует и доступен ────────────────────────
  --      → SHOP_NOT_AVAILABLE
  SELECT * INTO v_shop FROM shops.shops WHERE id = p_shop_id FOR UPDATE;

  IF NOT FOUND
     OR v_shop.status <> 'active'
     OR v_shop.is_accepting_orders = FALSE
  THEN
    RAISE EXCEPTION 'SHOP_NOT_AVAILABLE';
  END IF;

  -- ─── 2. Радиус доставки ──────────────────────────────────────
  --      → OUT_OF_DELIVERY_RANGE
  v_distance_m := ST_Distance(v_shop.location, v_delivery_geog);

  IF v_distance_m > v_shop.delivery_radius_m THEN
    RAISE EXCEPTION 'OUT_OF_DELIVERY_RANGE'
      USING DETAIL = 'distance=' || ROUND(v_distance_m)::TEXT || 'm, max=' || v_shop.delivery_radius_m::TEXT || 'm';
  END IF;

  -- ─── 3. Часы работы магазина ─────────────────────────────────
  --      → SHOP_CLOSED_NOW
  IF NOT orders._is_shop_open_now(v_shop.working_hours, v_shop.timezone) THEN
    RAISE EXCEPTION 'SHOP_CLOSED_NOW';
  END IF;

  -- ─── 4. Расчёт subtotal + проверка наличия товаров ───────────
  --      → ITEM_OUT_OF_STOCK
  --
  -- Создаём заказ и позиции в одной транзакции, при этом блокируем
  -- товары FOR UPDATE и сразу декрементируем stock.
  -- Если хоть один товар out of stock — RAISE и весь заказ откатится.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item ->> 'qty')::INTEGER, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_ITEM_QTY' USING DETAIL = v_item::TEXT;
    END IF;

    SELECT * INTO v_product
      FROM catalog.products
     WHERE id = (v_item ->> 'product_id')::UUID
       AND shop_id = p_shop_id
     FOR UPDATE;

    -- Различаем два разных случая:
    --   1) Товар отсутствует или скрыт — ITEM_NOT_AVAILABLE.
    --      Случается когда продавец удалил/скрыл товар после того,
    --      как покупатель добавил его в корзину.
    --   2) Товар есть и активен, но stock < qty — ITEM_OUT_OF_STOCK.
    -- У этих ошибок принципиально разная UX-реакция в боте.
    IF NOT FOUND OR v_product.is_active = FALSE THEN
      RAISE EXCEPTION 'ITEM_NOT_AVAILABLE'
        USING DETAIL = 'product_id=' || (v_item ->> 'product_id');
    END IF;

    IF v_product.stock < v_qty THEN
      RAISE EXCEPTION 'ITEM_OUT_OF_STOCK'
        USING DETAIL = 'product_id=' || (v_item ->> 'product_id') || ', requested=' || v_qty::TEXT
                       || ', available=' || v_product.stock::TEXT;
    END IF;

    v_line_total := v_product.price * v_qty;
    v_subtotal   := v_subtotal + v_line_total;
  END LOOP;

  -- ─── 5. Минимальная сумма заказа ─────────────────────────────
  --      → BELOW_MIN_ORDER
  IF v_subtotal < v_shop.min_order_amount THEN
    RAISE EXCEPTION 'BELOW_MIN_ORDER'
      USING DETAIL = 'subtotal=' || v_subtotal::TEXT || ', min=' || v_shop.min_order_amount::TEXT;
  END IF;

  -- ─── 6. Максимальная сумма заказа (с доставкой) ──────────────
  --      → ABOVE_MAX_ORDER
  v_effective_delivery := CASE
    WHEN v_shop.free_delivery_from IS NOT NULL AND v_subtotal >= v_shop.free_delivery_from THEN 0
    ELSE v_shop.delivery_fee
  END;

  v_total := v_subtotal + v_effective_delivery;

  IF v_shop.max_order_amount IS NOT NULL AND v_total > v_shop.max_order_amount THEN
    RAISE EXCEPTION 'ABOVE_MAX_ORDER'
      USING DETAIL = 'total=' || v_total::TEXT || ', max=' || v_shop.max_order_amount::TEXT;
  END IF;

  -- ─── Все проверки прошли. Создаём заказ. ─────────────────────
  INSERT INTO orders.orders (
    buyer_id, shop_id, subtotal, delivery_fee, total,
    delivery_address, delivery_location, distance_m,
    payment_method, notes, status
  )
  VALUES (
    p_buyer_id, p_shop_id, v_subtotal, v_effective_delivery, v_total,
    p_delivery_address, v_delivery_geog, ROUND(v_distance_m)::INTEGER,
    p_payment_method, p_notes, 'pending'
  )
  RETURNING * INTO v_order;

  -- Создаём позиции и атомарно списываем stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item ->> 'qty')::INTEGER;

    SELECT * INTO v_product FROM catalog.products WHERE id = (v_item ->> 'product_id')::UUID;
    v_line_total := v_product.price * v_qty;

    INSERT INTO orders.order_items (
      order_id, product_id, product_name, unit_price, qty, line_total
    )
    VALUES (
      v_order.id, v_product.id, v_product.name, v_product.price, v_qty, v_line_total
    );

    UPDATE catalog.products
       SET stock      = stock - v_qty,
           updated_at = NOW()
     WHERE id = v_product.id;
  END LOOP;

  -- Первая запись в истории статусов
  INSERT INTO orders.status_history (order_id, prev_status, new_status, actor_id, reason)
  VALUES (v_order.id, NULL, 'pending', p_buyer_id, NULL);

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION orders.create_order IS 'Атомарное создание заказа с 6 валидациями: SHOP_NOT_AVAILABLE, OUT_OF_DELIVERY_RANGE, SHOP_CLOSED_NOW, ITEM_OUT_OF_STOCK, BELOW_MIN_ORDER, ABOVE_MAX_ORDER';


-- ─────────────────────────────────────────────────────────────────
-- orders.update_status
-- Изменить статус заказа с проверкой допустимости перехода.
--
-- Допустимые переходы:
--   pending     → accepted | rejected | cancelled
--   accepted    → ready    | cancelled
--   ready       → delivering | cancelled
--   delivering  → completed
--   completed   → (terminal)
--   rejected    → (terminal)
--   cancelled   → (terminal)
--
-- При недопустимом переходе — RAISE 'INVALID_STATUS_TRANSITION'.
-- При rejected или cancelled — обязательна p_reason.
-- При rejected/cancelled — возвращаем stock обратно на склад.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders.update_status(
  p_order_id    UUID,
  p_new_status  orders.order_status,
  p_actor_id    UUID,
  p_reason      TEXT DEFAULT NULL
)
RETURNS orders.orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       orders.orders;
  v_old_status  orders.order_status;
  v_valid       BOOLEAN;
  v_item        orders.order_items;
BEGIN
  SELECT * INTO v_order FROM orders.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Сохраняем предыдущий статус ДО UPDATE — иначе RETURNING вернёт уже новый.
  v_old_status := v_order.status;

  -- Проверка допустимости перехода
  v_valid := CASE v_old_status
    WHEN 'pending'    THEN p_new_status IN ('accepted', 'rejected', 'cancelled')
    WHEN 'accepted'   THEN p_new_status IN ('ready', 'cancelled')
    WHEN 'ready'      THEN p_new_status IN ('delivering', 'cancelled')
    WHEN 'delivering' THEN p_new_status = 'completed'
    ELSE FALSE
  END;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'
      USING DETAIL = 'from=' || v_old_status::TEXT || ', to=' || p_new_status::TEXT;
  END IF;

  -- Для rejected / cancelled нужна причина
  IF p_new_status IN ('rejected', 'cancelled') AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  -- При rejected/cancelled — возвращаем stock
  IF p_new_status IN ('rejected', 'cancelled') THEN
    FOR v_item IN SELECT * FROM orders.order_items WHERE order_id = v_order.id
    LOOP
      UPDATE catalog.products
         SET stock      = stock + v_item.qty,
             updated_at = NOW()
       WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  UPDATE orders.orders
     SET status           = p_new_status,
         rejection_reason = CASE WHEN p_new_status IN ('rejected', 'cancelled') THEN p_reason ELSE rejection_reason END,
         updated_at       = NOW()
   WHERE id = p_order_id
   RETURNING * INTO v_order;

  INSERT INTO orders.status_history (order_id, prev_status, new_status, actor_id, reason)
  VALUES (p_order_id, v_old_status, p_new_status, p_actor_id, p_reason);

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION orders.update_status IS 'Сменить статус заказа с проверкой допустимости. При rejected/cancelled возвращает stock';


-- ─────────────────────────────────────────────────────────────────
-- orders.list_by_buyer
-- Заказы покупателя с фильтром по статусу. Пагинация.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders.list_by_buyer(
  p_buyer_id      UUID,
  p_status_filter orders.order_status DEFAULT NULL,
  p_page          INTEGER DEFAULT 1,
  p_per_page      INTEGER DEFAULT 10
)
RETURNS TABLE (
  id            UUID,
  number        BIGINT,
  shop_id       UUID,
  shop_name     TEXT,
  shop_phone    TEXT,
  subtotal      NUMERIC(15,2),
  delivery_fee  NUMERIC(15,2),
  total         NUMERIC(15,2),
  status        orders.order_status,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.id,
    o.number,
    o.shop_id,
    s.name        AS shop_name,
    s.phone       AS shop_phone,
    o.subtotal,
    o.delivery_fee,
    o.total,
    o.status,
    o.created_at
  FROM orders.orders o
  JOIN shops.shops    s ON s.id = o.shop_id
  WHERE o.buyer_id = p_buyer_id
    AND (p_status_filter IS NULL OR o.status = p_status_filter)
  ORDER BY o.created_at DESC
  LIMIT p_per_page OFFSET GREATEST((p_page - 1), 0) * p_per_page;
$$;

COMMENT ON FUNCTION orders.list_by_buyer IS 'История заказов покупателя с подтянутым названием магазина';


-- ─────────────────────────────────────────────────────────────────
-- orders.list_by_shop
-- Заказы магазина с фильтром по статусу. Пагинация.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders.list_by_shop(
  p_shop_id       UUID,
  p_status_filter orders.order_status DEFAULT NULL,
  p_page          INTEGER DEFAULT 1,
  p_per_page      INTEGER DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  number          BIGINT,
  buyer_id        UUID,
  buyer_first_name TEXT,
  buyer_phone     TEXT,
  subtotal        NUMERIC(15,2),
  delivery_fee    NUMERIC(15,2),
  total           NUMERIC(15,2),
  delivery_address TEXT,
  distance_m      INTEGER,
  status          orders.order_status,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.id,
    o.number,
    o.buyer_id,
    u.first_name AS buyer_first_name,
    u.phone      AS buyer_phone,
    o.subtotal,
    o.delivery_fee,
    o.total,
    o.delivery_address,
    o.distance_m,
    o.status,
    o.created_at
  FROM orders.orders o
  JOIN auth.users    u ON u.id = o.buyer_id
  WHERE o.shop_id = p_shop_id
    AND (p_status_filter IS NULL OR o.status = p_status_filter)
  ORDER BY o.created_at DESC
  LIMIT p_per_page OFFSET GREATEST((p_page - 1), 0) * p_per_page;
$$;

COMMENT ON FUNCTION orders.list_by_shop IS 'Заказы магазина с подтянутым именем и телефоном покупателя';


-- ─────────────────────────────────────────────────────────────────
-- orders.get_dashboard_stats
-- Статистика магазина за указанный период (для seller-bot и /shops/:id).
-- p_period: 'today' | 'week' | 'month' | 'all'
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders.get_dashboard_stats(
  p_shop_id UUID,
  p_period  TEXT DEFAULT 'today'
)
RETURNS TABLE (
  orders_total      BIGINT,
  orders_pending    BIGINT,
  orders_completed  BIGINT,
  orders_cancelled  BIGINT,
  revenue_completed NUMERIC(15,2),
  avg_order_value   NUMERIC(15,2)
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day',   NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'
    WHEN 'week'  THEN date_trunc('week',  NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'
    WHEN 'month' THEN date_trunc('month', NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'
    ELSE TIMESTAMPTZ 'epoch'
  END;

  RETURN QUERY
  SELECT
    COUNT(*)                                                       AS orders_total,
    COUNT(*) FILTER (WHERE status = 'pending')                     AS orders_pending,
    COUNT(*) FILTER (WHERE status = 'completed')                   AS orders_completed,
    COUNT(*) FILTER (WHERE status IN ('rejected','cancelled'))     AS orders_cancelled,
    COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)    AS revenue_completed,
    COALESCE(AVG(total) FILTER (WHERE status = 'completed'), 0)    AS avg_order_value
  FROM orders.orders
  WHERE shop_id    = p_shop_id
    AND created_at >= v_since;
END;
$$;

COMMENT ON FUNCTION orders.get_dashboard_stats IS 'Сводная статистика магазина за период: today, week, month, all';
