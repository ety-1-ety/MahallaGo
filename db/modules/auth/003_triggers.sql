-- ─────────────────────────────────────────────────────────────────
-- Модуль AUTH — триггеры
-- ─────────────────────────────────────────────────────────────────

-- Универсальная функция автообновления updated_at для любых таблиц.
-- Создаётся в схеме auth, но используется во всех модулях через FROM auth.set_updated_at().
CREATE OR REPLACE FUNCTION auth.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auth.set_updated_at IS 'Универсальный триггер автообновления updated_at для всех таблиц';


-- auth.users.updated_at
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON auth.users;
CREATE TRIGGER trg_users_set_updated_at
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();

-- auth.sessions.updated_at
DROP TRIGGER IF EXISTS trg_sessions_set_updated_at ON auth.sessions;
CREATE TRIGGER trg_sessions_set_updated_at
  BEFORE UPDATE ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_updated_at();
