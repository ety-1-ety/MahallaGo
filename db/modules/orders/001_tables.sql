-- ─────────────────────────────────────────────────────────────────
-- Модуль ORDERS — таблицы
-- ─────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS orders;
COMMENT ON SCHEMA orders IS 'Заказы: header, позиции, история статусов';

-- ─────────────────────────────────────────────────────────────────
-- Тип статуса заказа
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE orders.order_status AS ENUM (
    'pending',     -- создан покупателем, ожидает действия продавца
    'accepted',    -- принят продавцом, готовится
    'ready',       -- готов к выдаче
    'delivering',  -- передан курьеру / доставляется
    'completed',   -- доставлен и подтверждён
    'rejected',    -- отклонён продавцом с причиной
    'cancelled'    -- отменён покупателем
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE orders.order_status IS 'Статус заказа: pending → accepted → ready → delivering → completed (либо rejected/cancelled на любом раннем шаге)';

-- ─────────────────────────────────────────────────────────────────
-- Тип способа оплаты
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE orders.payment_method AS ENUM (
    'cash'  -- наличные при доставке (единственный метод в MVP)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE orders.payment_method IS 'Способ оплаты. В MVP только cash';


-- ─────────────────────────────────────────────────────────────────
-- orders.orders — header заказа
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders.orders (
  id                 UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Человекочитаемый номер заказа (для отображения в боте: "#1234")
  number             BIGSERIAL               NOT NULL UNIQUE,

  buyer_id           UUID                    NOT NULL REFERENCES auth.users(id)  ON DELETE RESTRICT,
  shop_id            UUID                    NOT NULL REFERENCES shops.shops(id) ON DELETE RESTRICT,

  -- Финансы (рассчитываются в orders.create_order, замораживаются)
  subtotal           NUMERIC(15,2)           NOT NULL CHECK (subtotal >= 0),
  delivery_fee       NUMERIC(15,2)           NOT NULL CHECK (delivery_fee >= 0),
  total              NUMERIC(15,2)           NOT NULL CHECK (total >= 0),

  -- Доставка
  delivery_address   TEXT                    NOT NULL,
  delivery_location  GEOGRAPHY(POINT, 4326)  NOT NULL,
  distance_m         INTEGER                 NULL,

  -- Оплата и заметки
  payment_method     orders.payment_method   NOT NULL DEFAULT 'cash',
  notes              TEXT                    NULL,

  -- Статус и причины
  status             orders.order_status     NOT NULL DEFAULT 'pending',
  rejection_reason   TEXT                    NULL,

  created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  orders.orders                     IS 'Заголовок заказа. Финансовые поля заморожены при создании';
COMMENT ON COLUMN orders.orders.id                  IS 'Внутренний UUID заказа';
COMMENT ON COLUMN orders.orders.number              IS 'Человекочитаемый номер заказа (отображается как #1234)';
COMMENT ON COLUMN orders.orders.buyer_id            IS 'Покупатель (auth.users.id). RESTRICT — нельзя удалить пользователя с заказами';
COMMENT ON COLUMN orders.orders.shop_id             IS 'Магазин-получатель заказа';
COMMENT ON COLUMN orders.orders.subtotal            IS 'Сумма позиций до доставки (sum(price * qty))';
COMMENT ON COLUMN orders.orders.delivery_fee        IS 'Эффективная стоимость доставки (0 если subtotal >= free_delivery_from)';
COMMENT ON COLUMN orders.orders.total               IS 'Итог = subtotal + delivery_fee';
COMMENT ON COLUMN orders.orders.delivery_address    IS 'Адрес доставки текстом (для продавца)';
COMMENT ON COLUMN orders.orders.delivery_location   IS 'Координаты доставки (PostGIS). Используются для расчёта расстояния';
COMMENT ON COLUMN orders.orders.distance_m          IS 'Расстояние от магазина до точки доставки в метрах (заморожено при создании)';
COMMENT ON COLUMN orders.orders.payment_method      IS 'Способ оплаты. В MVP только cash';
COMMENT ON COLUMN orders.orders.notes               IS 'Комментарий покупателя к заказу (опционально)';
COMMENT ON COLUMN orders.orders.status              IS 'Текущий статус (см. orders.order_status)';
COMMENT ON COLUMN orders.orders.rejection_reason    IS 'Причина rejected/cancelled, заполняется в orders.update_status';
COMMENT ON COLUMN orders.orders.created_at          IS 'Время создания заказа (атомарно с валидацией)';
COMMENT ON COLUMN orders.orders.updated_at          IS 'Время последнего изменения статуса';

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id        ON orders.orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id         ON orders.orders (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status     ON orders.orders (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active_for_shop ON orders.orders (shop_id, created_at DESC)
  WHERE status IN ('pending', 'accepted', 'ready', 'delivering');


-- ─────────────────────────────────────────────────────────────────
-- orders.order_items — позиции заказа
-- Цена и название замораживаются при создании (чтобы не зависеть от
-- последующих изменений товара).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders.order_items (
  id                 UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id           UUID            NOT NULL REFERENCES orders.orders(id)   ON DELETE CASCADE,
  product_id         UUID            NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  product_name       TEXT            NOT NULL,
  unit_price         NUMERIC(15,2)   NOT NULL CHECK (unit_price >= 0),
  qty                INTEGER         NOT NULL CHECK (qty > 0),
  line_total         NUMERIC(15,2)   NOT NULL CHECK (line_total >= 0),
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  orders.order_items              IS 'Позиции заказа. Название и цена замораживаются при создании';
COMMENT ON COLUMN orders.order_items.id           IS 'UUID позиции';
COMMENT ON COLUMN orders.order_items.order_id     IS 'Родительский заказ. CASCADE при удалении заказа';
COMMENT ON COLUMN orders.order_items.product_id   IS 'Товар. RESTRICT — нельзя физически удалить товар с заказами';
COMMENT ON COLUMN orders.order_items.product_name IS 'Замороженное название товара на момент заказа';
COMMENT ON COLUMN orders.order_items.unit_price   IS 'Замороженная цена за единицу на момент заказа';
COMMENT ON COLUMN orders.order_items.qty          IS 'Количество единиц';
COMMENT ON COLUMN orders.order_items.line_total   IS 'unit_price × qty (заморожено)';
COMMENT ON COLUMN orders.order_items.created_at   IS 'Время создания позиции';
COMMENT ON COLUMN orders.order_items.updated_at   IS 'Время последнего изменения';

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON orders.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON orders.order_items (product_id);


-- ─────────────────────────────────────────────────────────────────
-- orders.status_history — таймлайн статусов заказа
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders.status_history (
  id           UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID                 NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  prev_status  orders.order_status  NULL,
  new_status   orders.order_status  NOT NULL,
  actor_id     UUID                 NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT                 NULL,
  created_at   TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  orders.status_history             IS 'История изменений статуса заказа (таймлайн в админке /orders/:id)';
COMMENT ON COLUMN orders.status_history.id          IS 'UUID записи';
COMMENT ON COLUMN orders.status_history.order_id    IS 'Заказ. CASCADE при удалении';
COMMENT ON COLUMN orders.status_history.prev_status IS 'Статус ДО изменения (NULL для первой записи о создании)';
COMMENT ON COLUMN orders.status_history.new_status  IS 'Статус ПОСЛЕ изменения';
COMMENT ON COLUMN orders.status_history.actor_id    IS 'Кто инициировал переход (покупатель, продавец, админ). NULL = system';
COMMENT ON COLUMN orders.status_history.reason      IS 'Причина (для rejected/cancelled)';
COMMENT ON COLUMN orders.status_history.created_at  IS 'Время изменения';
COMMENT ON COLUMN orders.status_history.updated_at  IS 'Время последнего изменения записи';

CREATE INDEX IF NOT EXISTS idx_status_history_order_id ON orders.status_history (order_id, created_at ASC);
