# @mahallago/buyer-bot

Telegram-бот покупателя — `@MahallaGoBot`.

## Возможности

- **Первичный выбор языка** uz/ru при /start.
- **Главное меню (Reply 2x2):** «Магазины рядом», «Корзина», «Мои заказы», «Настройки».
- **Поиск магазинов** по геолокации с радиусом 2км через `shops.find_nearby`. Карточки с фото, дистанцией, статусом «Открыт до 22:00», мин. заказом, доставкой.
- **Просмотр магазина** по категориям (с количеством товаров) → товары с inline-кнопками `[➖] qty [➕] [🛒]`.
- **Корзина в Redis-сессии**, привязана к одному магазину. При добавлении товара из другого магазина — автоматический сброс.
- **Checkout flow:**
  1. Адрес (текст или геолокация)
  2. Заметка к заказу (или skip)
  3. Подтверждение
  4. `orders.create_order` со всеми 6 валидациями
  5. Локализованный ответ покупателю (включая динамические `{min}` / `{max}`)
  6. Redis publish в `orders:new` → push продавцу
- **История заказов** через `orders.list_by_buyer` со статусными метками.
- **i18n uz/ru**, английского нет.
- **Rate limit** 10 req/sec/пользователь.

## Маппинг ошибок `orders.create_order`

| Код | Локализованное сообщение |
|---|---|
| `SHOP_NOT_AVAILABLE`     | ❌ Магазин сейчас не принимает заказы. |
| `OUT_OF_DELIVERY_RANGE`  | ❌ Ваш адрес за пределами зоны доставки магазина. |
| `BELOW_MIN_ORDER`        | ❌ Минимальная сумма заказа: 30 000 сум |
| `ABOVE_MAX_ORDER`        | ❌ Максимальная сумма заказа: 200 000 сум |
| `SHOP_CLOSED_NOW`        | ❌ Магазин сейчас закрыт. Попробуйте в рабочее время. |
| `ITEM_OUT_OF_STOCK`      | ❌ Один из товаров закончился. Обновите корзину. |

## Запуск

```bash
cp .env.example .env
# заполнить BOT_TOKEN от @BotFather, проверить DATABASE_URL и REDIS_URL

pnpm --filter @mahallago/buyer-bot dev
```

## Архитектура

```
src/
├── index.js              — bot setup, middleware chain, callback routes, graceful shutdown
├── middleware/           — session, i18n, rateLimit, errorHandler
├── handlers/
│   ├── start.js
│   ├── menu.js           — router reply-кнопок
│   ├── findShops.js      — геолокация → shops.find_nearby
│   ├── browseShop.js     — категории и карточки товаров с inc/dec/add
│   ├── cart.js           — show / clear / edit / checkout
│   ├── myOrders.js       — orders.list_by_buyer
│   └── settings.js       — переключение языка
├── conversations/
│   ├── chooseLanguage.js — первичный выбор uz/ru
│   └── checkout.js       — 3-шаговый checkout с маппингом 6 ошибок
└── keyboards/            — mainMenu, shopCard, productCard, cartView
```
