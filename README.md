# MahallaShop

Hyperlocal маркетплейс магазинов в Telegram для Узбекистана. Покупатели находят
магазины в радиусе 500м-2км от своей геолокации, заказывают, магазины доставляют
сами.

**Аналоги:** Dukaan, Khatabook, Magicpin (Индия), Glovo, Getir (Европа), Yassir
(Северная Африка), Talabat (MENA), Rappi (LATAM).

**Целевой масштаб MVP (Phase 1):** 500 активных магазинов, ~2 000 заказов в день.

---

## Топология деплоя (2 VPS)

```
                            Покупатели и продавцы
                                     │
                              Telegram Network
                                     │
                       ┌─────────────┴─────────────┐
                       │   Long-polling updates    │
                       ▼                           ▼
        ┌──────────────────────────────────────────────────┐
        │  ╔════════════════════════════════════════════╗  │
        │  ║         VPS #2 — "app" (публичный)         ║  │
        │  ║  VPS · Ubuntu 22.04        ║  │
        │  ╚════════════════════════════════════════════╝  │
        │                                                  │
        │   systemd:                                       │
        │   ├─ mahallashop-buyer-bot   (grammY, polling)   │
        │   ├─ mahallashop-seller-bot  (grammY, polling)   │
        │   └─ mahallashop-admin-api   (Fastify :3000)     │
        │                                                  │
        │   Nginx + Let's Encrypt:                         │
        │   ├─ shop.mahallashop.uz  → Angular static       │
        │   └─ api.mahallashop.uz   → proxy → :3000        │
        │                                                  │
        └──────────────────┬───────────────────────────────┘
                           │
                           │ private network
                           │ 10.0.0.0/16  (приватная)
                           │
        ┌──────────────────┴───────────────────────────────┐
        │  ╔════════════════════════════════════════════╗  │
        │  ║       VPS #1 — "data" (приватный)          ║  │
        │  ║  VPS · 16 GB RAM · Ubuntu 22.04  ║  │
        │  ╚════════════════════════════════════════════╝  │
        │                                                  │
        │   ├─ PostgreSQL 16 + PostGIS  (:5432)            │
        │   ├─ Redis 7                  (:6379)            │
        │   └─ cron: pg_dump → object storage         │
        │                                                  │
        │   Доступен ТОЛЬКО из VPS #2 через 10.0.0.0/16    │
        └──────────────────────────────────────────────────┘
```

`DATABASE_URL` и `REDIS_URL` на VPS #2 указывают на приватный IP VPS #1.

---

## Технологический стек

### Backend (все Node.js пакеты)

| Что | Чем |
|---|---|
| Runtime | Node.js 20 LTS |
| Язык | Plain JavaScript (без TypeScript) |
| Боты | grammY + `@grammyjs/conversations` + `@grammyjs/storage-redis` |
| База | PostgreSQL 16 + PostGIS |
| DB driver | node-postgres (`pg`) — без ORM, только raw SQL |
| Cache / pub-sub | ioredis |
| Logger | pino (с pino-pretty в dev) |
| Config | dotenv с ручной валидацией |
| HTTP сервер | Fastify (только admin-api) |
| Process manager | systemd |
| Менеджер пакетов | pnpm + workspaces |

### Admin Panel

| Что | Чем |
|---|---|
| Framework | Angular 21 (standalone, signals, `@if/@for/@switch`) |
| UI | Angular Material 20, кастомная тема (зелёный/синий флага УЗ) |
| Charts | ng2-charts (Chart.js) |
| Maps | ngx-leaflet (OpenStreetMap) |
| Auth | Telegram Login Widget → JWT (httpOnly cookie) |
| Тема | Light/dark toggle, сохраняется в localStorage |

---

## Структура монорепо

```
mahallashop/
├── packages/
│   ├── shared/          — общие утилиты (pg pool, redis, logger, i18n, errors, time)
│   ├── buyer-bot/       — Telegram-бот покупателя (@MahallaShop_bot)
│   ├── seller-bot/      — Telegram-бот продавца (@MahallaShop_seller_bot)
│   ├── admin-api/       — Fastify backend для админ-панели
│   └── admin-web/       — Angular 21 SPA для админ-панели
├── db/
│   ├── extensions.sql   — uuid-ossp, postgis, pg_trgm
│   ├── modules/         — модульные миграции (auth, shops, catalog, orders, delivery)
│   ├── seeds/           — категории, начальный админ
│   └── _runner.js       — applies миграций с учётом таблицы _migrations
├── deploy/
│   ├── vps1-data/       — postgresql.conf, pg_hba.conf, redis.conf, backup.sh
│   └── vps2-app/        — systemd units, Nginx config, certbot
└── scripts/
    ├── migrate.js
    ├── seed.js
    └── refresh-functions.js
```

---

## Локальная разработка

**Требования:**
- Node.js 20 LTS (`nvm use` подхватит из `.nvmrc`). Локально работает и Node 22/24.
- pnpm 9+ (`npm i -g pnpm`).
- PostgreSQL 16+ с расширениями `postgis`, `uuid-ossp`, `pg_trgm`. Локально работает PG 18.
- Redis 7+ (можно через WSL/Memurai на Windows).

**Установка:**

```bash
# 1. Зависимости
pnpm install

# 2. Создать локальную БД (один раз)
createdb mahallashop_dev   # Linux/Mac
# или: psql -U postgres -c "CREATE DATABASE mahallashop_dev"

# 3. Скопировать .env.example → .env (или использовать готовые значения для localhost)
cp .env.example .env
cp packages/buyer-bot/.env.example  packages/buyer-bot/.env
cp packages/seller-bot/.env.example packages/seller-bot/.env
cp packages/admin-api/.env.example  packages/admin-api/.env

# 4. Заполнить BOT_TOKEN, JWT_SECRET, ADMIN_TG_IDS

# 5. Миграции и сиды
pnpm migrate
pnpm seed
```

**Запуск сервисов в dev:**

```bash
pnpm dev:buyer-bot
pnpm dev:seller-bot
pnpm dev:admin-api    # http://localhost:3000
pnpm dev:admin-web    # http://localhost:4200
```

**Шпаргалка команд:**

| Команда | Что делает |
|---|---|
| `pnpm migrate` | Применить все миграции БД (extensions + 4 модуля) |
| `pnpm seed` | Залить категории и системного админа |
| `pnpm refresh-functions` | Переприменить только `002_functions.sql` всех модулей (быстрая итерация) |
| `pnpm dev:buyer-bot` | Запустить покупательского бота |
| `pnpm dev:seller-bot` | Запустить продавцовского бота |
| `pnpm dev:admin-api` | Запустить Fastify backend |
| `pnpm dev:admin-web` | Запустить Angular dev-сервер |
| `pnpm build:admin-web` | Production-сборка Angular |
| `pnpm --filter <pkg> <cmd>` | Любая команда в одном пакете |

---

## Локализация

- Только узбекский (по умолчанию для бота) и русский (по умолчанию для админки).
- **Английский запрещён** в любом UI, видимом пользователю.
- Все строки UI — в i18n JSON: `uz.json`, `ru.json` (бот) и `core/i18n/{uz,ru}.ts` (Angular). Хардкод запрещён.
- Валюта: UZS (сум). Формат: `40 000 сум` (узбекский: `40 000 soʻm`).
- Часовой пояс отображения: `Asia/Tashkent`. В БД — `TIMESTAMPTZ`.

---

## Деплой

Полный гайд: [`deploy/README.md`](deploy/README.md). Кратко:

### VPS #1 (data)
```bash
sudo DB_PASSWORD='...' REDIS_PASSWORD='...' PRIVATE_IP='10.0.0.11' \
  bash deploy/vps1-data/setup-vps1.sh
```
Установит PostgreSQL 16+PostGIS, Redis 7, настроит cron для daily backup.

### VPS #2 (app)
```bash
sudo bash deploy/vps2-app/setup-vps2.sh
# затем заполнить .env, запустить pnpm migrate && pnpm seed,
# выпустить SSL через certbot.sh, применить финальный nginx config,
# systemctl start mahallashop-{buyer-bot,seller-bot,admin-api}
```

### Обновления
```bash
VPS_HOST=mahallashop@<ip> bash deploy/deploy.sh
# rsync + pnpm install + build admin-web + systemctl restart
```

> Скрипты firewall **не входят** в репозиторий — настраиваются владельцем инфраструктуры.

---

## Структура БД

5 модулей PostgreSQL, каждый — отдельная схема со своими таблицами,
функциями, триггерами и view:

| Схема | Назначение | Ключевые функции |
|---|---|---|
| `auth` | Telegram пользователи, JWT-сессии | `upsert_user`, `set_language`, `mark_as_admin` |
| `shops` | Магазины, модерация, геолокация (PostGIS) | `register`, `find_nearby`, `approve`/`reject`/`suspend`, `update_settings`, `toggle_accepting_orders` |
| `catalog` | Категории, товары | `add_product`, `update_product`, `search_products`, `list_categories_with_counts` |
| `orders` | Заказы, позиции, история статусов | **`create_order` (6 валидаций)**, `update_status`, `list_by_buyer`/`list_by_shop`, `get_dashboard_stats` |
| `delivery` | Phase 2 placeholder | — |

**Ключевая функция `orders.create_order`** атомарно проверяет:
1. `SHOP_NOT_AVAILABLE` — магазин не active или is_accepting_orders=false
2. `OUT_OF_DELIVERY_RANGE` — покупатель за пределами `delivery_radius_m`
3. `BELOW_MIN_ORDER` — `subtotal < min_order_amount`
4. `ABOVE_MAX_ORDER` — `total > max_order_amount` (если задано)
5. `SHOP_CLOSED_NOW` — текущее время вне `working_hours`
6. `ITEM_OUT_OF_STOCK` — какой-то товар закончился

При ошибке весь заказ откатывается. При успехе списывает stock и
создаёт первую запись в `status_history`.

Тестовый прогон всех 6 валидаций: `psql -f scripts/test-create-order-validations.sql`.

---

## Готовность по стадиям

- ✅ Стадия 1: скелет монорепо + git
- ✅ Стадия 2: вся БД (4 модуля + runner + seeds + тест 6 валидаций)
- ✅ Стадия 3: пакет `shared` (pg, redis, i18n, logger, config, errors, time)
- ✅ Стадия 4: `seller-bot` (онбординг 6 шагов, addProduct 5 шагов, settings, orders, notifier)
- ✅ Стадия 5: `buyer-bot` (find_nearby, browse, cart, checkout с маппингом 6 ошибок)
- ✅ Стадия 6: `admin-api` (Fastify, Telegram auth, JWT cookie, модерация, pub/sub)
- ✅ Стадия 7: `admin-web` (Angular 21, Material 20, UZ-flag тема, login + dashboard + moderation + shops; orders/users/map/analytics/settings — stub'ы)
- ✅ Стадия 8: `deploy/` (systemd, Nginx, setup-скрипты, бэкапы, без firewall)
- ✅ Стадия 9: этот README

## Что осталось до launch

1. **Реальные Telegram bot tokens** — создать `@MahallaShop_bot` и `@MahallaShop_seller_bot` в @BotFather.
2. **Login Widget домен** — настроить `setdomain` в @BotFather на `shop.mahallashop.uz`.
3. **VPS** — создать 2 VPS в одной Cloud Network.
4. **DNS** — A-записи `shop.` и `api.` на VPS#2.
5. **Firewall** — настроить вручную (закрыть всё кроме 22/80/443 на VPS#2; БД и Redis VPS#1 доступны только из 10.0.0.0/16).
6. **object storage** для бэкапов (опционально, но рекомендовано).
7. **Прогон деплоя** — следовать [`deploy/README.md`](deploy/README.md).
8. **Доделать stub-страницы admin-web** (`/orders`, `/users`, `/map`, `/analytics`, `/settings`) после первичного запуска.

---

## Лицензия

Proprietary.
