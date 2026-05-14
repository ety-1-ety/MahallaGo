# @mahallago/seller-bot

Telegram-бот продавца — `@MahallaGo_seller_bot`.

## Возможности

- **6-шаговый онбординг** регистрации магазина: название → категория → геолокация → телефон → фото → часы работы. Магазин создаётся со `status='pending_approval'`.
- **Главное меню (Reply 2x3):** «Принимаю заказы / Не принимаю», «Заказы», «Мои товары», «Добавить товар», «Статистика», «Настройки».
- **5-шаговый wizard добавления товара:** название → категория → цена → остаток → фото.
- **Меню настроек** (inline): мин. сумма, **макс. сумма** (с возможностью сброса), доставка, бесплатно от, радиус, часы работы.
- **Жизненный цикл заказа** через inline-кнопки на карточке: pending → accepted → ready → delivering → completed; reject/cancel с причиной.
- **Push-уведомления о новых заказах** через Redis pub/sub (канал `orders:new`).
- **Push-уведомления об одобрении/отклонении** магазина (канал `shops:moderation`).
- **i18n uz/ru**, английского нет.
- **Rate limit** 10 req/sec/пользователь через Redis sliding window.
- **Status guard** — блокирует управление магазином пока он не `active`.

## Запуск

```bash
cp .env.example .env
# заполнить BOT_TOKEN от @BotFather, проверить DATABASE_URL и REDIS_URL

pnpm --filter @mahallago/seller-bot dev
```

## Окружение

См. `.env.example`. Обязательные:
- `BOT_TOKEN` — от @BotFather
- `DATABASE_URL` — postgresql://...
- `REDIS_URL` — redis://...

Опциональные (с дефолтами):
- `REDIS_PREFIX=seller:`
- `REDIS_CHANNEL_NEW_ORDER=orders:new`
- `REDIS_CHANNEL_MODERATION=shops:moderation`
- `RATE_LIMIT_PER_SEC=10`
- `LOG_LEVEL=info`

## Архитектура

```
src/
├── index.js              — bot setup, middleware chain, graceful shutdown
├── middleware/
│   ├── session.js         — Redis session storage (RedisAdapter)
│   ├── i18n.js            — auth.upsert_user + загрузка магазина в ctx
│   ├── rateLimit.js       — sliding window 10 req/sec через Redis
│   ├── statusGuard.js     — блокирует действия для не-active магазинов
│   └── errorHandler.js    — bot.catch — DomainError → локализованное сообщение
├── handlers/
│   ├── start.js           — /start: онбординг или меню
│   ├── menu.js            — router reply-кнопок главного меню
│   ├── toggleAccepting.js — переключатель is_accepting_orders
│   ├── myProducts.js      — список товаров магазина
│   ├── stats.js           — orders.get_dashboard_stats за today/week/month
│   ├── settings.js        — открыть inline-меню + applySettingUpdate
│   └── orders.js          — список активных заказов + callback-кнопки
├── conversations/
│   ├── onboarding.js      — 6-шаговый wizard регистрации магазина
│   ├── addProduct.js      — 5-шаговый wizard добавления товара
│   └── editSetting.js     — редактирование одной настройки (универсальный)
├── keyboards/
│   ├── mainMenu.js        — Reply Keyboard 2x3
│   ├── settings.js        — Inline-меню настроек с текущими значениями
│   └── orderCard.js       — кнопки заказа по статусу
└── notifier.js            — подписка на orders:new и shops:moderation
```
