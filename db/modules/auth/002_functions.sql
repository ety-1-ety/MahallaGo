-- ─────────────────────────────────────────────────────────────────
-- Модуль AUTH — функции
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- auth.upsert_user
-- Создать или обновить пользователя по telegram_id.
-- Вызывается ботами при каждом входящем апдейте (через /start или middleware).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.upsert_user(
  p_telegram_id   BIGINT,
  p_username      TEXT DEFAULT NULL,
  p_first_name    TEXT DEFAULT NULL,
  p_last_name     TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT NULL
)
RETURNS auth.users
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lang TEXT;
  v_user auth.users;
BEGIN
  -- Нормализуем язык: только uz и ru, всё остальное → uz
  v_lang := CASE
    WHEN p_language_code IN ('uz', 'ru') THEN p_language_code
    WHEN p_language_code = 'ru-RU'        THEN 'ru'
    WHEN p_language_code LIKE 'ru%'       THEN 'ru'
    ELSE 'uz'
  END;

  INSERT INTO auth.users (
    telegram_id, username, first_name, last_name, language_code, last_seen_at
  )
  VALUES (
    p_telegram_id, p_username, p_first_name, p_last_name, v_lang, NOW()
  )
  ON CONFLICT (telegram_id) DO UPDATE SET
    username     = COALESCE(EXCLUDED.username,   auth.users.username),
    first_name   = COALESCE(EXCLUDED.first_name, auth.users.first_name),
    last_name    = COALESCE(EXCLUDED.last_name,  auth.users.last_name),
    last_seen_at = NOW(),
    updated_at   = NOW()
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;

COMMENT ON FUNCTION auth.upsert_user IS 'Создать или обновить пользователя Telegram. Не перезаписывает язык, если запись уже есть';


-- ─────────────────────────────────────────────────────────────────
-- auth.set_language
-- Сменить язык пользователя (вызывается из настроек бота).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.set_language(
  p_user_id  UUID,
  p_language TEXT
)
RETURNS auth.users
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user auth.users;
BEGIN
  IF p_language NOT IN ('uz', 'ru') THEN
    RAISE EXCEPTION 'INVALID_LANGUAGE_CODE'
      USING DETAIL = 'Допустимы только uz и ru';
  END IF;

  UPDATE auth.users
     SET language_code = p_language,
         updated_at    = NOW()
   WHERE id = p_user_id
   RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING DETAIL = p_user_id::TEXT;
  END IF;

  RETURN v_user;
END;
$$;

COMMENT ON FUNCTION auth.set_language IS 'Сменить язык интерфейса. Допустимы только uz и ru';


-- ─────────────────────────────────────────────────────────────────
-- auth.mark_as_admin
-- Дать или забрать права админа. Вызывается из админ-панели или вручную.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.mark_as_admin(
  p_telegram_id BIGINT,
  p_is_admin    BOOLEAN DEFAULT TRUE
)
RETURNS auth.users
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user auth.users;
BEGIN
  UPDATE auth.users
     SET is_admin   = p_is_admin,
         updated_at = NOW()
   WHERE telegram_id = p_telegram_id
   RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND'
      USING DETAIL = 'Telegram ID ' || p_telegram_id::TEXT || ' не найден. Сначала пользователь должен написать боту';
  END IF;

  RETURN v_user;
END;
$$;

COMMENT ON FUNCTION auth.mark_as_admin IS 'Дать или забрать права админа у существующего пользователя по telegram_id';


-- ─────────────────────────────────────────────────────────────────
-- auth.touch_last_seen
-- Обновить last_seen_at (вызывается middleware ботов на каждом апдейте).
-- Лёгкий UPDATE без возврата записи — для частого использования.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.touch_last_seen(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE auth.users
     SET last_seen_at = NOW()
   WHERE id = p_user_id;
$$;

COMMENT ON FUNCTION auth.touch_last_seen IS 'Обновить last_seen_at без триггера updated_at — частый вызов';
