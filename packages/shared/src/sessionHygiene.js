// ─────────────────────────────────────────────────────────────────
// Гигиена сессий бота: чистка протухших conversation-state.
//
// grammY conversations 1.x хранит весь replay-state в session.conversation —
// большой массив-tree всех записанных событий. Если flow прервался
// (бот crash'нулся, код поменялся, пользователь перестал отвечать) —
// этот state остаётся в Redis. На следующее сообщение от пользователя
// бот пытается replay'ить устаревший state, что часто кончается
// зависанием обработки updates.
//
// Защита:
//   1. На старте бота — sweepStaleConversations() удаляет conversation
//      из всех session, где `last` (timestamp последнего события)
//      старше CONVERSATION_TTL_MS.
//   2. errorHandler через clearConversationFromSession() — если в
//      conversation что-то падает, мы стираем blob, не оставляя кашу.
//   3. /reset команда — пользователь может вручную сбросить state.
//
// CONVERSATION_TTL_MS дефолт 30 минут — этого достаточно для checkout
// и онбординга, но не позволяет state «зависать» на сутки.
// ─────────────────────────────────────────────────────────────────

import { getRedis } from './redis/client.js';

export const CONVERSATION_TTL_MS = 30 * 60 * 1000;

/**
 * Получить полный ключ session с учётом keyPrefix ioredis-клиента.
 * Если у клиента включён keyPrefix='buyer:', то под капотом он сам
 * добавит этот префикс. Поэтому передаём именно logical-ключ
 * `${REDIS_PREFIX}sess:${id}` — это и есть то, что использует
 * grammY session middleware (см. middleware/session.js).
 */
function fullKey(prefix, telegramId) {
  return `${prefix}sess:${telegramId}`;
}

/**
 * Сканирует все session-ключи в Redis и удаляет conversation-blob
 * у тех, где он старше TTL. Запускается из bot index.js на старте.
 *
 * @param {Object} opts
 * @param {string} opts.prefix       — REDIS_PREFIX (например 'buyer:')
 * @param {number} [opts.ttlMs]      — порог возраста в мс (default 30 min)
 * @param {{ info, warn }} [opts.log]
 * @returns {Promise<{ scanned, cleaned }>}
 */
export async function sweepStaleConversations({ prefix, ttlMs = CONVERSATION_TTL_MS, log = console }) {
  const redis = getRedis();
  const now = Date.now();

  // Пробуем оба варианта pattern: с keyPrefix (двойной) и без.
  // ioredis с keyPrefix добавляет его при keys() автоматически? Нет — keys()
  // НЕ применяет keyPrefix к pattern, поэтому ищем явно по сырому ключу.
  // У нас в Redis ключи реально хранятся как `<prefix><prefix>sess:<id>`
  // (двойной), потому что getSessionKey возвращает уже `<prefix>sess:<id>`,
  // а ioredis-клиент префикс ставит сверху.
  const patterns = [
    `${prefix}${prefix}sess:*`,
    `${prefix}sess:*`,
  ];
  const seen = new Set();
  for (const pattern of patterns) {
    const ks = await redis.keys(pattern);
    for (const k of ks) seen.add(k);
  }

  let cleaned = 0;
  for (const key of seen) {
    const raw = await redis.get(key);
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed.conversation) continue;

    // grammY 1.x пишет внутри conversation поле "last" — таймстамп
    // последнего обновления. Ищем его в массиве (формат tree-encoded).
    const last = extractLastTimestamp(parsed.conversation);
    if (last !== null && (now - last) < ttlMs) continue;  // живая

    delete parsed.conversation;
    await redis.set(key, JSON.stringify(parsed), 'EX', 60 * 60 * 24 * 30);
    cleaned++;
  }

  log.info({ scanned: seen.size, cleaned, ttlMs }, 'session hygiene sweep');
  return { scanned: seen.size, cleaned };
}

/**
 * Inline-проверка свежести conversation для конкретной сессии.
 * Вызывается из auth+i18n middleware ПЕРЕД conversations()-middleware.
 * Если у сессии есть conversation-blob, и его `last` старше ttlMs —
 * удаляем blob прямо в объекте session. grammY conversations потом
 * увидит «нет активного диалога» и обработает update как обычный.
 *
 * Возвращает true если что-то очистили (полезно для логирования).
 *
 * Не делает ни одной Redis-операции — sync-функция, чистит локальный
 * объект; persist делает session-middleware при выходе из update.
 */
export function expireStaleConversation(session, ttlMs = CONVERSATION_TTL_MS) {
  if (!session || !session.conversation) return false;
  const last = extractLastTimestamp(session.conversation);
  if (last === null) return false;
  if ((Date.now() - last) < ttlMs) return false;
  delete session.conversation;
  return true;
}

/**
 * Очистить conversation у конкретного пользователя — например при
 * /reset или при ошибке внутри conversation handler.
 */
export async function clearConversationFromSession({ prefix, telegramId }) {
  if (!telegramId) return false;
  const redis = getRedis();
  const key = fullKey(prefix, telegramId);
  const raw = await redis.get(key);
  if (!raw) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  if (!parsed.conversation) return false;
  delete parsed.conversation;
  await redis.set(key, JSON.stringify(parsed), 'EX', 60 * 60 * 24 * 30);
  return true;
}

/**
 * Найти `last` timestamp внутри tree-encoded `conversation` blob.
 * Формат grammY 1.x: массив с интернированными ключами. Ищем строку
 * "last" и берём следующее за ней значение если число.
 */
function extractLastTimestamp(blob) {
  if (!Array.isArray(blob)) return null;
  for (let i = 0; i < blob.length - 1; i++) {
    if (blob[i] === 'last' && typeof blob[i + 1] === 'number' && blob[i + 1] > 1e12) {
      return blob[i + 1];
    }
  }
  return null;
}
