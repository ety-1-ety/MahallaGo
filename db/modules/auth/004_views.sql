-- ─────────────────────────────────────────────────────────────────
-- Модуль AUTH — представления
-- ─────────────────────────────────────────────────────────────────

-- Активные сессии (не просроченные и не отозванные)
CREATE OR REPLACE VIEW auth.v_active_sessions AS
SELECT
  s.id,
  s.user_id,
  u.telegram_id,
  u.username,
  u.first_name,
  u.last_name,
  s.user_agent,
  s.ip_address,
  s.expires_at,
  s.created_at,
  s.updated_at AS last_used_at
FROM auth.sessions s
JOIN auth.users    u ON u.id = s.user_id
WHERE s.revoked_at IS NULL
  AND s.expires_at > NOW();

COMMENT ON VIEW auth.v_active_sessions IS 'Активные refresh-сессии с подтянутым профилем пользователя';


-- Список администраторов с их статусом
CREATE OR REPLACE VIEW auth.v_admins AS
SELECT
  id,
  telegram_id,
  username,
  first_name,
  last_name,
  language_code,
  is_blocked,
  last_seen_at,
  created_at
FROM auth.users
WHERE is_admin = TRUE
ORDER BY created_at DESC;

COMMENT ON VIEW auth.v_admins IS 'Все пользователи с правами админа (для страницы /settings в админке)';
