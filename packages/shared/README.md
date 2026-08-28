# @mahallago/shared

Общие утилиты для всех Node.js пакетов MahallaGo:
buyer-bot, seller-bot, admin-api.

## Экспорты

```js
// Подключение к PostgreSQL
import { getPool, closePool, withTx, callFn, callFnRow, query } from '@mahallago/shared/db';

// Redis
import { getRedis, getRedisSubscriber, closeRedis } from '@mahallago/shared/redis';

// Локализация
import { t, tError, tOrderStatus, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@mahallago/shared/i18n';

// Логгер pino
import { createLogger } from '@mahallago/shared/logger';

// Конфиг с валидацией
import { loadConfig, ConfigError } from '@mahallago/shared/config';

// Ошибки
import { DomainError, fromPgError, ORDER_ERRORS, COMMON_ERRORS } from '@mahallago/shared/errors';

// Время и часовой пояс Asia/Tashkent
import { formatUZS, formatDateTime, isShopOpenNow, closeTimeToday } from '@mahallago/shared/time';
```

## Зависимости от env-переменных

| Модуль | Переменная | Обязательно |
|---|---|---|
| `db/pool.js`     | `DATABASE_URL`  | ✓ при первом вызове `getPool()` |
| `redis/client.js`| `REDIS_URL`     | ✓ при первом вызове `getRedis()` |
| `redis/client.js`| `REDIS_PREFIX`  | нет (для `key:` пространств имён) |
| `logger.js`      | `NODE_ENV`, `LOG_LEVEL` | нет |

`dotenv/config` должен быть импортирован в entry-файле каждого пакета
ДО первого вызова любой функции `shared`.

## Маппинг ошибок

SQL-функции бросают `RAISE EXCEPTION '<CODE>'` с одним из доменных
кодов. `callFn`/`callFnRow` оборачивают эти ошибки в `DomainError` с
полем `.code`. Для пользователя:

```js
try {
  const order = await callFnRow('orders.create_order', [...]);
} catch (err) {
  if (err instanceof DomainError) {
    await ctx.reply(tError(locale, 'buyer', err.code));
  } else {
    log.error({ err }, 'unexpected db error');
    await ctx.reply(t(locale, 'common.error_unknown'));
  }
}
```

## i18n

Словари: `src/i18n/locales/uz.json`, `src/i18n/locales/ru.json`.
Все строки UI ботов должны быть в этих файлах. Хардкод запрещён.

Плейсхолдеры в формате `{name}`:

```json
{ "buyer.cart.title": "🛒 *Ваша корзина - {shop_name}*" }
```

```js
t('ru', 'buyer.cart.title', { shop_name: 'Бахт-маркет' })
// → "🛒 *Ваша корзина - Бахт-маркет*"
```
