-- ─────────────────────────────────────────────────────────────────
-- Расширения PostgreSQL
-- Применяется ПЕРВЫМ, до всех модулей.
-- ─────────────────────────────────────────────────────────────────

-- Генерация UUID v4 для первичных ключей
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Геопространственные типы (GEOGRAPHY) и индексы (GIST)
-- для shops.location и orders.delivery_location
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Триграммный поиск по подстроке (для GIN индексов на shops.name,
-- catalog.products.name) — нечёткий поиск магазинов и товаров
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Типы данных для часовых поясов уже встроены в PostgreSQL
-- (TIMESTAMPTZ, AT TIME ZONE) — расширение не нужно.
