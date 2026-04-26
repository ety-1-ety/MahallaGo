-- ─────────────────────────────────────────────────────────────────
-- Модуль ORDERS — представления
-- ─────────────────────────────────────────────────────────────────

-- Заказы с подтянутыми магазином и покупателем (для админки /orders)
CREATE OR REPLACE VIEW orders.v_orders_full AS
SELECT
  o.id,
  o.number,
  o.buyer_id,
  u.telegram_id  AS buyer_telegram_id,
  u.username     AS buyer_username,
  u.first_name   AS buyer_first_name,
  u.last_name    AS buyer_last_name,
  u.phone        AS buyer_phone,
  o.shop_id,
  s.name         AS shop_name,
  s.slug         AS shop_slug,
  s.phone        AS shop_phone,
  o.subtotal,
  o.delivery_fee,
  o.total,
  o.delivery_address,
  ST_Y(o.delivery_location::GEOMETRY) AS delivery_lat,
  ST_X(o.delivery_location::GEOMETRY) AS delivery_lng,
  o.distance_m,
  o.payment_method,
  o.status,
  o.rejection_reason,
  o.notes,
  o.created_at,
  o.updated_at
FROM orders.orders o
JOIN auth.users   u ON u.id = o.buyer_id
JOIN shops.shops  s ON s.id = o.shop_id;

COMMENT ON VIEW orders.v_orders_full IS 'Заказы с подтянутыми покупателем и магазином (для админки)';


-- Полный таймлайн статусов с именами акторов (для /orders/:id)
CREATE OR REPLACE VIEW orders.v_status_timeline AS
SELECT
  h.id,
  h.order_id,
  h.prev_status,
  h.new_status,
  h.actor_id,
  u.telegram_id  AS actor_telegram_id,
  u.username     AS actor_username,
  u.first_name   AS actor_first_name,
  u.is_admin     AS actor_is_admin,
  h.reason,
  h.created_at
FROM orders.status_history h
LEFT JOIN auth.users u ON u.id = h.actor_id
ORDER BY h.order_id, h.created_at ASC;

COMMENT ON VIEW orders.v_status_timeline IS 'Таймлайн изменений статуса заказа с информацией о том, кто инициировал переход';
