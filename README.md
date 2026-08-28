# MahallaGo

Hyperlocal маркетплейс магазинов в Telegram для Узбекистана. Покупатели находят
магазины рядом по геолокации (500м-2км), заказывают, магазины доставляют сами.

Целевой масштаб MVP: ~500 магазинов, ~2000 заказов в день.

## Стек

Backend (все пакеты на Node.js):

- Node.js 20 LTS, plain JavaScript (без TypeScript)
- Боты: grammY (+ conversations, redis-storage)
- PostgreSQL 16 + PostGIS, node-postgres (raw SQL, без ORM)
- Redis 7 (ioredis), pino, Fastify (только admin-api)
- pnpm workspaces, systemd

Admin panel:

- Angular 21 (standalone, signals), Angular Material 20
- ng2-charts (Chart.js), ngx-leaflet (OSM)
- Telegram Login Widget -> JWT в httpOnly cookie

## Структура

```
mahallago/
├── packages/
│   ├── shared/      общие утилиты (pg, redis, logger, i18n, errors, time)
│   ├── buyer-bot/   бот покупателя (@MahallaGo_UzBot)
│   ├── seller-bot/  бот продавца (@MahallaGo_SellerBot)
│   ├── admin-api/   Fastify backend админки
│   └── admin-web/   Angular SPA админки
├── db/              extensions, модульные миграции, seeds, runner
└── scripts/         migrate, seed, refresh-functions
```

## Локальная разработка

Требования: Node.js 20+, pnpm 9+, PostgreSQL 16+ (postgis, uuid-ossp, pg_trgm), Redis 7+.

```bash
pnpm install

# создать локальную БД
createdb mahallago_dev

# .env из примеров, заполнить BOT_TOKEN, JWT_SECRET, ADMIN_TG_IDS
cp .env.example .env
cp packages/buyer-bot/.env.example  packages/buyer-bot/.env
cp packages/seller-bot/.env.example packages/seller-bot/.env
cp packages/admin-api/.env.example  packages/admin-api/.env

pnpm migrate
pnpm seed
```

Запуск в dev:

```bash
pnpm dev:buyer-bot
pnpm dev:seller-bot
pnpm dev:admin-api    # http://localhost:3000
pnpm dev:admin-web    # http://localhost:4200
```

## Локализация

- Узбекский (дефолт бота) и русский (дефолт админки), английского в UI нет.
- Все строки UI в i18n JSON (бот) и `core/i18n` (Angular), хардкод запрещён.
- Валюта UZS, отображение времени `Asia/Tashkent`, в БД `TIMESTAMPTZ`.

## База данных

5 модулей-схем PostgreSQL: `auth`, `shops`, `catalog`, `orders`, `delivery`.
Каждый модуль это отдельная схема со своими таблицами, функциями и триггерами.

Ключевая `orders.create_order` атомарно проверяет доступность магазина, зону
доставки, минимальную и максимальную сумму, часы работы и наличие товара,
откатывая весь заказ при любой ошибке.

## Лицензия

Proprietary.
