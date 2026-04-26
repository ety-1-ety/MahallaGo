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
- Node.js 20 LTS (`nvm use` подхватит из `.nvmrc`).
- pnpm 9+ (`npm i -g pnpm`).
- PostgreSQL 16+ с расширениями `postgis`, `uuid-ossp`, `pg_trgm`.
- Redis 7+.

**Установка зависимостей:**

```bash
pnpm install
```

**Создание базы данных и применение миграций:**

```bash
# Один раз — создать БД (Linux/Mac):
psql -U postgres -c "CREATE DATABASE mahallashop_dev"

# Скопировать .env.example → .env во всех пакетах и заполнить значения.
cp .env.example .env
cp packages/buyer-bot/.env.example packages/buyer-bot/.env
cp packages/seller-bot/.env.example packages/seller-bot/.env
cp packages/admin-api/.env.example packages/admin-api/.env

# Применить миграции:
pnpm migrate

# Залить базовые данные (категории, начальный админ):
pnpm seed
```

**Запуск сервисов в dev-режиме:**

```bash
pnpm dev:buyer-bot
pnpm dev:seller-bot
pnpm dev:admin-api
pnpm dev:admin-web
```

---

## Локализация

- Только узбекский (по умолчанию для бота) и русский (по умолчанию для админки).
- **Английский запрещён** в любом UI, видимом пользователю.
- Все строки UI — в i18n JSON: `uz.json`, `ru.json`. Хардкод запрещён.
- Валюта: UZS (сум). Формат: `40 000 сум`.
- Часовой пояс отображения: `Asia/Tashkent`. В БД — `TIMESTAMPTZ`.

---

## Деплой

См. подробный гайд в `deploy/README.md` (создаётся на Стадии 8). Кратко:

1. **VPS #1 (data):** запустить `deploy/vps1-data/setup-vps1.sh` — установит PostgreSQL+PostGIS, Redis, настроит конфиги, создаст БД и пользователей. Настроить `cron` для `backup.sh`.
2. **VPS #2 (app):** запустить `deploy/vps2-app/setup-vps2.sh` — установит Node.js 20, pnpm, Nginx. Скопировать репозиторий через `deploy/deploy.sh`. Зарегистрировать systemd units. Запустить `certbot.sh` для Let's Encrypt.
3. Заполнить `.env` каждого пакета на VPS #2 (DATABASE_URL и REDIS_URL — приватный IP VPS #1).
4. `systemctl start mahallashop-{buyer-bot,seller-bot,admin-api}`.

> Скрипты настройки firewall **не входят** в репозиторий — настраиваются вручную.

---

## Лицензия

Proprietary.
