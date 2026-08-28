// Telegram Mini App · верификация initData
//
// Telegram WebApp передаёт фронту строку `initData` (query-string), часть
// полей которой подписана HMAC-SHA256. Бэкенд обязан проверить подпись,
// чтобы убедиться, что данные пришли от Telegram, а не подделаны.
//
// Алгоритм (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   1. Разбираем initData как URLSearchParams.
//   2. Извлекаем поле `hash` - это и есть подпись Telegram.
//   3. Все оставшиеся пары `key=value` сортируем по ключу, склеиваем
//      строкой `key=value\nkey=value\n...` → `data_check_string`.
//   4. secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN).
//   5. computed = HMAC_SHA256(data_check_string, secret_key).
//   6. computed === hash (constant-time compare) - валидно.
//
// Дополнительно проверяем `auth_date` - отвергаем, если старше 24 часов
// (стандартный TTL Telegram'а, защищает от replay).

import crypto from 'node:crypto';

export const DEFAULT_INIT_DATA_TTL_SECONDS = 24 * 60 * 60;  // 24 часа

/**
 * @typedef {Object} VerifiedInitData
 * @property {string} hash              - подпись (которая прошла проверку)
 * @property {number} authDate          - Unix-timestamp в секундах
 * @property {Object} user              - распарсенный JSON `user`
 * @property {number} user.id           - telegram_id (BigInt-safe: всегда умещается в Number)
 * @property {string} [user.username]
 * @property {string} [user.first_name]
 * @property {string} [user.last_name]
 * @property {string} [user.language_code]
 * @property {boolean} [user.is_bot]
 * @property {string} [startParam]      - поле start_param (от deep-link)
 * @property {URLSearchParams} raw      - все исходные поля (на случай если кому-то нужны)
 */

/**
 * Проверяет initData, возвращает распарсенные данные.
 *
 * @param {string} initDataString    - `Telegram.WebApp.initData` как есть
 * @param {string} botToken          - токен соответствующего бота
 * @param {Object} [opts]
 * @param {number} [opts.ttlSeconds] - макс. возраст в секундах (default 24h)
 * @param {number} [opts.now]        - для тестов: Unix-time в секундах
 * @returns {VerifiedInitData}
 * @throws {Error} с .code:
 *   - INVALID_INIT_DATA - пустая строка или нет hash
 *   - BAD_HASH          - подпись не сошлась
 *   - EXPIRED           - auth_date старше ttlSeconds
 *   - INVALID_USER      - нет/битый JSON в поле `user`
 */
export function verifyInitData(initDataString, botToken, opts = {}) {
  if (!initDataString || typeof initDataString !== 'string') {
    throw makeErr('INVALID_INIT_DATA', 'initData is empty or not a string');
  }
  if (!botToken || typeof botToken !== 'string') {
    throw makeErr('INVALID_INIT_DATA', 'botToken is required');
  }

  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_INIT_DATA_TTL_SECONDS;
  const nowSec     = opts.now ?? Math.floor(Date.now() / 1000);

  const params = new URLSearchParams(initDataString);
  const hash   = params.get('hash');
  if (!hash) throw makeErr('INVALID_INIT_DATA', 'hash field missing');

  // Собираем data_check_string: все пары кроме hash, отсортированные по ключу.
  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    entries.push([k, v]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  // secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
  // ВАЖНО: ключ - это "WebAppData", сообщение - BOT_TOKEN.
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // constant-time compare
  const computedBuf = Buffer.from(computed, 'hex');
  const expectedBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== expectedBuf.length
      || !crypto.timingSafeEqual(computedBuf, expectedBuf)) {
    throw makeErr('BAD_HASH', 'hash mismatch');
  }

  // auth_date freshness
  const authDateStr = params.get('auth_date');
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw makeErr('INVALID_INIT_DATA', 'auth_date missing or invalid');
  }
  if ((nowSec - authDate) > ttlSeconds) {
    throw makeErr('EXPIRED', `auth_date ${authDate} older than ${ttlSeconds}s`);
  }

  // user - JSON
  const userJson = params.get('user');
  if (!userJson) throw makeErr('INVALID_USER', 'user field missing');
  let user;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw makeErr('INVALID_USER', 'user is not valid JSON');
  }
  if (!user || typeof user.id !== 'number') {
    throw makeErr('INVALID_USER', 'user.id missing');
  }

  return {
    hash,
    authDate,
    user,
    startParam: params.get('start_param') || undefined,
    raw: params,
  };
}

function makeErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
