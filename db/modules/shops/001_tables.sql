-- ─────────────────────────────────────────────────────────────────
-- Модуль SHOPS — таблицы
-- ─────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS shops;
COMMENT ON SCHEMA shops IS 'Магазины: регистрация, модерация, настройки, геолокация';

-- ─────────────────────────────────────────────────────────────────
-- Тип статуса магазина
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE shops.shop_status AS ENUM (
    'pending_approval',  -- зарегистрирован, ждёт одобрения админа
    'active',            -- одобрен, виден покупателям
    'rejected',          -- отклонён модерацией с причиной
    'suspended',         -- временно заблокирован админом
    'closed'             -- закрыт самим владельцем
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE shops.shop_status IS 'Статус модерации магазина: pending_approval, active, rejected, suspended, closed';


-- ─────────────────────────────────────────────────────────────────
-- shops.shops
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops.shops (
  id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id            UUID                    NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Профиль
  name                TEXT                    NOT NULL,
  slug                TEXT                    NOT NULL UNIQUE,
  category            TEXT                    NULL,
  description         TEXT                    NULL,
  photo_file_id       TEXT                    NULL,
  phone               TEXT                    NOT NULL,
  address             TEXT                    NOT NULL,
  location            GEOGRAPHY(POINT, 4326)  NOT NULL,
  working_hours       JSONB                   NOT NULL DEFAULT '{}'::JSONB,
  timezone            TEXT                    NOT NULL DEFAULT 'Asia/Tashkent',

  -- Модерация
  status              shops.shop_status       NOT NULL DEFAULT 'pending_approval',
  rejection_reason    TEXT                    NULL,
  approved_at         TIMESTAMPTZ             NULL,
  approved_by         UUID                    NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Настройки заказов
  min_order_amount    NUMERIC(15,2)           NOT NULL DEFAULT 0    CHECK (min_order_amount >= 0),
  max_order_amount    NUMERIC(15,2)           NULL                  CHECK (max_order_amount IS NULL OR max_order_amount >= min_order_amount),
  delivery_fee        NUMERIC(15,2)           NOT NULL DEFAULT 0    CHECK (delivery_fee >= 0),
  free_delivery_from  NUMERIC(15,2)           NULL                  CHECK (free_delivery_from IS NULL OR free_delivery_from >= 0),
  delivery_radius_m   INTEGER                 NOT NULL DEFAULT 500  CHECK (delivery_radius_m > 0 AND delivery_radius_m <= 10000),
  is_accepting_orders BOOLEAN                 NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  shops.shops                     IS 'Зарегистрированные магазины. Виден покупателям только при status=active AND is_accepting_orders=true';
COMMENT ON COLUMN shops.shops.id                  IS 'Внутренний UUID магазина';
COMMENT ON COLUMN shops.shops.owner_id            IS 'Владелец магазина (auth.users.id), один пользователь может владеть несколькими';
COMMENT ON COLUMN shops.shops.name                IS 'Название магазина (отображаемое в карточках)';
COMMENT ON COLUMN shops.shops.slug                IS 'URL-friendly идентификатор (генерируется из name + uuid-фрагмент)';
COMMENT ON COLUMN shops.shops.category            IS 'Тип магазина: продукты, аптека, бытовая химия и т.д. (свободный текст)';
COMMENT ON COLUMN shops.shops.description         IS 'Краткое описание для карточки магазина';
COMMENT ON COLUMN shops.shops.photo_file_id       IS 'Telegram file_id обложки магазина (отображается в карточке)';
COMMENT ON COLUMN shops.shops.phone               IS 'Контактный телефон магазина (отображается покупателям)';
COMMENT ON COLUMN shops.shops.address             IS 'Адрес магазина текстом (для отображения)';
COMMENT ON COLUMN shops.shops.location            IS 'Геолокация магазина (PostGIS POINT в WGS84). Используется в shops.find_nearby и для расчёта расстояния до покупателя';
COMMENT ON COLUMN shops.shops.working_hours       IS 'Часы работы по дням недели в JSONB. Формат: {"mon":{"open":"09:00","close":"22:00"},"tue":...,"sun":{"closed":true}}';
COMMENT ON COLUMN shops.shops.timezone            IS 'Часовой пояс магазина (для проверки рабочих часов в orders.create_order)';
COMMENT ON COLUMN shops.shops.status              IS 'Статус модерации (см. shops.shop_status)';
COMMENT ON COLUMN shops.shops.rejection_reason    IS 'Причина отклонения, заполняется при status=rejected или suspended';
COMMENT ON COLUMN shops.shops.approved_at         IS 'Время одобрения магазина модератором';
COMMENT ON COLUMN shops.shops.approved_by         IS 'Кто из админов одобрил магазин (auth.users.id)';
COMMENT ON COLUMN shops.shops.min_order_amount    IS 'Минимальная сумма заказа без доставки. 0 = без ограничения снизу';
COMMENT ON COLUMN shops.shops.max_order_amount    IS 'Максимальная сумма заказа с доставкой. NULL = без ограничения сверху';
COMMENT ON COLUMN shops.shops.delivery_fee        IS 'Стоимость доставки. Если subtotal >= free_delivery_from — обнуляется';
COMMENT ON COLUMN shops.shops.free_delivery_from  IS 'Сумма заказа, начиная с которой доставка бесплатна. NULL = доставка всегда платная';
COMMENT ON COLUMN shops.shops.delivery_radius_m   IS 'Радиус доставки в метрах (от location). Покупатель за пределами получает OUT_OF_DELIVERY_RANGE';
COMMENT ON COLUMN shops.shops.is_accepting_orders IS 'Кнопка "Принимаю заказы" в seller-bot. FALSE = магазин не показывается покупателям даже при status=active';
COMMENT ON COLUMN shops.shops.created_at          IS 'Время регистрации магазина продавцом';
COMMENT ON COLUMN shops.shops.updated_at          IS 'Время последнего изменения (триггер trg_shops_set_updated_at)';

-- Индексы
CREATE INDEX IF NOT EXISTS idx_shops_owner_id            ON shops.shops (owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_status              ON shops.shops (status);
CREATE INDEX IF NOT EXISTS idx_shops_active_accepting    ON shops.shops (status, is_accepting_orders) WHERE status = 'active' AND is_accepting_orders = TRUE;
CREATE INDEX IF NOT EXISTS idx_shops_location_gist       ON shops.shops USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_shops_name_trgm           ON shops.shops USING GIN (name gin_trgm_ops);


-- ─────────────────────────────────────────────────────────────────
-- shops.moderation_log — аудит действий модераторов
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops.moderation_log (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID         NOT NULL REFERENCES shops.shops(id)  ON DELETE CASCADE,
  actor_id     UUID         NOT NULL REFERENCES auth.users(id)   ON DELETE RESTRICT,
  action       TEXT         NOT NULL CHECK (action IN ('approve', 'reject', 'suspend', 'activate', 'close')),
  prev_status  shops.shop_status NULL,
  new_status   shops.shop_status NOT NULL,
  reason       TEXT         NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  shops.moderation_log             IS 'История модерации магазинов: кто и когда менял статус';
COMMENT ON COLUMN shops.moderation_log.id          IS 'UUID записи журнала';
COMMENT ON COLUMN shops.moderation_log.shop_id     IS 'Магазин, к которому применено действие';
COMMENT ON COLUMN shops.moderation_log.actor_id    IS 'Админ, выполнивший действие';
COMMENT ON COLUMN shops.moderation_log.action      IS 'Тип действия: approve, reject, suspend, activate, close';
COMMENT ON COLUMN shops.moderation_log.prev_status IS 'Статус до действия';
COMMENT ON COLUMN shops.moderation_log.new_status  IS 'Статус после действия';
COMMENT ON COLUMN shops.moderation_log.reason      IS 'Текст причины (обязателен для reject и suspend)';
COMMENT ON COLUMN shops.moderation_log.created_at  IS 'Время действия';
COMMENT ON COLUMN shops.moderation_log.updated_at  IS 'Время последнего изменения записи';

CREATE INDEX IF NOT EXISTS idx_moderation_log_shop_id  ON shops.moderation_log (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_actor_id ON shops.moderation_log (actor_id);
