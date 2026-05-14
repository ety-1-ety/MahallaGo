# @mahallago/admin-api

Fastify backend для админ-панели MahallaGo. Слушает `localhost:3000`, за Nginx-прокси `api.mahallago.uz`.

## Аутентификация

`POST /api/auth/telegram` принимает payload от Telegram Login Widget.
Поток:

1. `verifyTelegramAuth` — проверяет hash через bot token (HMAC-SHA256 отсортированных полей по spec Telegram).
2. `auth.upsert_user` — создаёт или обновляет пользователя.
3. Доступ разрешён если `telegram_id ∈ ADMIN_TG_IDS` ИЛИ `auth.users.is_admin = true`. Первый whitelisted-вход поднимает `is_admin=true` в БД через `auth.mark_as_admin`.
4. JWT 24h в httpOnly cookie `mgo_admin`.

`POST /api/auth/logout` — стирает cookie.
`GET  /api/auth/me`     — текущий пользователь (требует cookie).

## Эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/health` | Проверка БД + Redis |
| `POST` | `/api/auth/telegram` | Логин через Telegram Login Widget |
| `POST` | `/api/auth/logout`   | Выход |
| `GET` | `/api/auth/me`        | Текущий пользователь |
| `GET` | `/api/dashboard/kpis` | Сводные KPI (магазины, заказы, GMV, юзеры) |
| `GET` | `/api/dashboard/orders-by-hour` | График заказов по часам за 7 дней |
| `GET` | `/api/dashboard/gmv-trend` | GMV по дням за 30 дней |
| `GET` | `/api/shops` | Список магазинов (`?status=&q=&page=&per_page=`) |
| `GET` | `/api/shops/pending` | Очередь модерации |
| `GET` | `/api/shops/:id` | Детальная карточка |
| `POST` | `/api/shops/:id/approve` | Одобрить → push продавцу через Redis |
| `POST` | `/api/shops/:id/reject`  | Отклонить с `reason` → push продавцу |
| `POST` | `/api/shops/:id/suspend` | Заблокировать → push продавцу |
| `GET` | `/api/shops/:id/photo`    | URL фото из Telegram getFile API |
| `GET` | `/api/shops/:id/products` | Товары магазина |
| `GET` | `/api/orders` | Список заказов (`?status=&shop_id=`) |
| `GET` | `/api/orders/:id` | Детали + items + timeline |
| `GET` | `/api/users` | Список пользователей |
| `POST` | `/api/users/:tg_id/mark-admin` | Дать/забрать админ-права |
| `GET` | `/api/analytics/shops-growth` | График регистраций магазинов |
| `GET` | `/api/analytics/top-categories` | Топ-10 категорий по выручке |
| `GET` | `/api/analytics/active-shops-map` | Координаты активных магазинов |
| `GET` | `/api/settings/admins` | Список админов из auth.v_admins |
| `GET` | `/api/settings/whitelist` | Текущий ADMIN_TG_IDS |

## Запуск

```bash
cp .env.example .env
# Заполнить:
#   JWT_SECRET (32+ random bytes)
#   BOT_TOKEN (тот же что у buyer-bot — Login Widget настраивается на него)
#   ADMIN_TG_IDS=12345,67890 (свой Telegram ID для первого входа)

pnpm --filter @mahallago/admin-api dev
```

## Verified

- `node --check` всех файлов проходит.
- `GET /health` → `{ status: 'ok', checks: { db: 'ok', redis: 'fail' } }` (БД работает, Redis ожидаемо offline).
- `GET /api/shops` без cookie → 401 `UNAUTHORIZED`.
- `GET /api/auth/me` без cookie → 401.
- `POST /api/auth/telegram` с invalid hash → 401 `INVALID_TELEGRAM_AUTH`.

## Архитектура

```
src/
├── index.js              — Fastify bootstrap, plugin chain, /api префикс, graceful shutdown
├── plugins/
│   ├── cors.js            — @fastify/cors с CORS_ORIGIN из env
│   ├── auth.js            — @fastify/cookie + @fastify/jwt, verifyTelegramAuth, requireAuth
│   └── errorHandler.js    — DomainError → 400 + код, прочее → 500
├── routes/
│   ├── health.js          — / (без /api префикса)
│   ├── auth.js            — POST /telegram, POST /logout, GET /me
│   ├── dashboard.js       — KPIs, orders-by-hour, gmv-trend
│   ├── shops.js           — CRUD + действия модерации
│   ├── orders.js          — list + detail (header + items + timeline)
│   ├── users.js           — list + mark-admin
│   ├── analytics.js       — shops-growth, top-categories, active-shops-map
│   └── settings.js        — admins, whitelist
└── services/
    ├── notifyBots.js      — Redis publish в shops:moderation
    └── telegramPhoto.js   — getFile API + 30-min in-memory cache
```
