-- ─────────────────────────────────────────────────────────────────
-- Модуль CATALOG — таблицы
-- ─────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS catalog;
COMMENT ON SCHEMA catalog IS 'Каталог: глобальные категории и товары конкретных магазинов';

-- ─────────────────────────────────────────────────────────────────
-- catalog.categories — глобальные категории товаров
-- (хлеб, овощи, молочка, мясо, аптека, бытовая химия и т.д.)
-- Заполняются seed-скриптом, продавцы выбирают из готового списка.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.categories (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT         NOT NULL UNIQUE,
  name_uz     TEXT         NOT NULL,
  name_ru     TEXT         NOT NULL,
  emoji       TEXT         NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 100,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  catalog.categories            IS 'Глобальные категории товаров (общие для всех магазинов)';
COMMENT ON COLUMN catalog.categories.id         IS 'UUID категории';
COMMENT ON COLUMN catalog.categories.slug       IS 'URL-friendly идентификатор (bread, vegetables, dairy, ...)';
COMMENT ON COLUMN catalog.categories.name_uz    IS 'Название на узбекском (отображается в боте при language_code=uz)';
COMMENT ON COLUMN catalog.categories.name_ru    IS 'Название на русском (отображается в боте при language_code=ru)';
COMMENT ON COLUMN catalog.categories.emoji      IS 'Эмодзи-иконка категории (отображается в карточке)';
COMMENT ON COLUMN catalog.categories.sort_order IS 'Порядок сортировки в списках категорий (меньше = выше)';
COMMENT ON COLUMN catalog.categories.is_active  IS 'Скрыть категорию из списков, не удаляя (для совместимости с историей)';
COMMENT ON COLUMN catalog.categories.created_at IS 'Время создания категории (обычно через seed)';
COMMENT ON COLUMN catalog.categories.updated_at IS 'Время последнего изменения';

CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON catalog.categories (sort_order) WHERE is_active = TRUE;


-- ─────────────────────────────────────────────────────────────────
-- catalog.products — товары конкретного магазина
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.products (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID            NOT NULL REFERENCES shops.shops(id)        ON DELETE CASCADE,
  category_id     UUID            NULL     REFERENCES catalog.categories(id) ON DELETE SET NULL,
  name            TEXT            NOT NULL,
  description     TEXT            NULL,
  photo_file_id   TEXT            NULL,
  price           NUMERIC(15,2)   NOT NULL CHECK (price >= 0),
  stock           INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  catalog.products               IS 'Товары конкретного магазина. Виден покупателям только при is_active=true И stock>0';
COMMENT ON COLUMN catalog.products.id            IS 'UUID товара';
COMMENT ON COLUMN catalog.products.shop_id       IS 'Магазин-владелец товара. CASCADE при удалении магазина';
COMMENT ON COLUMN catalog.products.category_id   IS 'Глобальная категория товара (catalog.categories). SET NULL если категорию удалили';
COMMENT ON COLUMN catalog.products.name          IS 'Название товара (свободный текст, отображается в карточке)';
COMMENT ON COLUMN catalog.products.description   IS 'Описание товара (отображается в развёрнутой карточке)';
COMMENT ON COLUMN catalog.products.photo_file_id IS 'Telegram file_id фото товара (отображается в карточке)';
COMMENT ON COLUMN catalog.products.price         IS 'Цена за единицу в UZS (NUMERIC для точности)';
COMMENT ON COLUMN catalog.products.stock         IS 'Текущий остаток на складе. При оформлении заказа уменьшается атомарно';
COMMENT ON COLUMN catalog.products.is_active     IS 'Видимость товара. FALSE = скрыт из каталога, не удаляя';
COMMENT ON COLUMN catalog.products.created_at    IS 'Время создания товара продавцом';
COMMENT ON COLUMN catalog.products.updated_at    IS 'Время последнего изменения';

-- Индексы
CREATE INDEX IF NOT EXISTS idx_products_shop_id      ON catalog.products (shop_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id  ON catalog.products (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_shop_active  ON catalog.products (shop_id, is_active, stock) WHERE is_active = TRUE AND stock > 0;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm    ON catalog.products USING GIN (name gin_trgm_ops);
