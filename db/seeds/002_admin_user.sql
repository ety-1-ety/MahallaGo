-- ─────────────────────────────────────────────────────────────────
-- Начальный супер-админ
--
-- В MVP до подключения реального Telegram Login Widget мы создаём
-- placeholder-пользователя с telegram_id=0 и is_admin=true.
-- Реальный telegram_id первого настоящего админа должен быть прописан
-- в admin-api/.env как ADMIN_TG_IDS — он попадёт в auth.users при
-- первом входе через Telegram Login Widget с is_admin=true.
--
-- Этот seed безопасно перезапускать — ON CONFLICT обновляет.
-- ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (telegram_id, username, first_name, language_code, is_admin)
VALUES (0, 'system', 'System', 'ru', TRUE)
ON CONFLICT (telegram_id) DO UPDATE SET
  is_admin   = TRUE,
  username   = 'system',
  first_name = 'System',
  updated_at = NOW();
