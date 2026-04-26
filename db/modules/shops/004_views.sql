-- ─────────────────────────────────────────────────────────────────
-- Модуль SHOPS — представления
-- ─────────────────────────────────────────────────────────────────

-- Очередь модерации (для админ-панели /moderation)
CREATE OR REPLACE VIEW shops.v_pending_moderation AS
SELECT
  s.id,
  s.name,
  s.slug,
  s.category,
  s.description,
  s.photo_file_id,
  s.phone,
  s.address,
  ST_Y(s.location::GEOMETRY) AS lat,
  ST_X(s.location::GEOMETRY) AS lng,
  s.working_hours,
  s.timezone,
  s.created_at,
  u.id            AS owner_id,
  u.telegram_id   AS owner_telegram_id,
  u.username      AS owner_username,
  u.first_name    AS owner_first_name,
  u.last_name     AS owner_last_name,
  u.phone         AS owner_phone
FROM shops.shops s
JOIN auth.users  u ON u.id = s.owner_id
WHERE s.status = 'pending_approval'
ORDER BY s.created_at ASC;

COMMENT ON VIEW shops.v_pending_moderation IS 'Магазины ожидающие одобрения, со встроенным профилем владельца. Сортировка FIFO';


-- Детальная карточка магазина для админки (/shops/:id)
CREATE OR REPLACE VIEW shops.v_shop_detail AS
SELECT
  s.*,
  ST_Y(s.location::GEOMETRY) AS lat,
  ST_X(s.location::GEOMETRY) AS lng,
  u.telegram_id   AS owner_telegram_id,
  u.username      AS owner_username,
  u.first_name    AS owner_first_name,
  u.last_name     AS owner_last_name,
  u.phone         AS owner_phone,
  approver.username   AS approved_by_username,
  approver.first_name AS approved_by_first_name
FROM shops.shops s
JOIN auth.users  u        ON u.id = s.owner_id
LEFT JOIN auth.users approver ON approver.id = s.approved_by;

COMMENT ON VIEW shops.v_shop_detail IS 'Полная карточка магазина с владельцем и модератором (для /shops/:id в админке)';


-- Сводка по статусам для дашборда
CREATE OR REPLACE VIEW shops.v_status_counts AS
SELECT
  status,
  COUNT(*) AS total
FROM shops.shops
GROUP BY status;

COMMENT ON VIEW shops.v_status_counts IS 'Количество магазинов по каждому статусу (для KPI на /dashboard)';
