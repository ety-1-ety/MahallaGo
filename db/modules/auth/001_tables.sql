-- ─────────────────────────────────────────────────────────────────
-- Модуль AUTH — таблицы
-- ─────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS auth;
COMMENT ON SCHEMA auth IS 'Аутентификация и идентификация пользователей Telegram, JWT-сессии админ-панели';

-- ─────────────────────────────────────────────────────────────────
-- auth.users
-- Один Telegram пользователь может выступать и покупателем, и продавцом.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.users (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id     BIGINT       NOT NULL UNIQUE,
  username        TEXT         NULL,
  first_name      TEXT         NULL,
  last_name       TEXT         NULL,
  phone           TEXT         NULL,
  language_code   TEXT         NOT NULL DEFAULT 'uz' CHECK (language_code IN ('uz', 'ru')),
  is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
  is_blocked      BOOLEAN      NOT NULL DEFAULT FALSE,
  last_seen_at    TIMESTAMPTZ  NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  auth.users               IS 'Пользователи Telegram. Один пользователь может быть и покупателем, и продавцом';
COMMENT ON COLUMN auth.users.id            IS 'Внутренний UUID пользователя';
COMMENT ON COLUMN auth.users.telegram_id   IS 'Уникальный Telegram ID пользователя (не меняется)';
COMMENT ON COLUMN auth.users.username      IS 'Telegram @username (может отсутствовать или меняться)';
COMMENT ON COLUMN auth.users.first_name    IS 'Имя из профиля Telegram';
COMMENT ON COLUMN auth.users.last_name     IS 'Фамилия из профиля Telegram';
COMMENT ON COLUMN auth.users.phone         IS 'Номер телефона (узнаётся через Telegram contact share)';
COMMENT ON COLUMN auth.users.language_code IS 'Язык интерфейса: uz (по умолчанию) или ru';
COMMENT ON COLUMN auth.users.is_admin      IS 'Флаг доступа в админ-панель (для модерации)';
COMMENT ON COLUMN auth.users.is_blocked    IS 'Заблокирован администратором — все действия запрещены';
COMMENT ON COLUMN auth.users.last_seen_at  IS 'Время последней активности пользователя в любом из ботов';
COMMENT ON COLUMN auth.users.created_at    IS 'Когда пользователь впервые написал боту';
COMMENT ON COLUMN auth.users.updated_at    IS 'Когда запись была обновлена в последний раз (триггер trg_users_set_updated_at)';

-- Поиск админов и быстрый фильтр заблокированных
CREATE INDEX IF NOT EXISTS idx_users_is_admin   ON auth.users (is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON auth.users (is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_username   ON auth.users (lower(username)) WHERE username IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────
-- auth.sessions
-- JWT refresh токены админ-панели. Access токен живёт в httpOnly cookie 24 часа.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.sessions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token   TEXT         NOT NULL UNIQUE,
  user_agent      TEXT         NULL,
  ip_address      INET         NULL,
  expires_at      TIMESTAMPTZ  NOT NULL,
  revoked_at      TIMESTAMPTZ  NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  auth.sessions               IS 'JWT refresh токены для админ-панели. Access токен короткоживущий, в cookie';
COMMENT ON COLUMN auth.sessions.id            IS 'Идентификатор сессии';
COMMENT ON COLUMN auth.sessions.user_id       IS 'Владелец сессии (auth.users.id)';
COMMENT ON COLUMN auth.sessions.refresh_token IS 'Случайная строка для обмена на новый access токен';
COMMENT ON COLUMN auth.sessions.user_agent    IS 'User-Agent браузера админа в момент логина';
COMMENT ON COLUMN auth.sessions.ip_address    IS 'IP с которого был выполнен логин';
COMMENT ON COLUMN auth.sessions.expires_at    IS 'Срок жизни refresh токена (обычно +30 дней от создания)';
COMMENT ON COLUMN auth.sessions.revoked_at    IS 'Если NOT NULL — сессия принудительно отозвана администратором';
COMMENT ON COLUMN auth.sessions.created_at    IS 'Время создания сессии (логин)';
COMMENT ON COLUMN auth.sessions.updated_at    IS 'Время последнего использования refresh токена';

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON auth.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth.sessions (expires_at) WHERE revoked_at IS NULL;
