// ─────────────────────────────────────────────────────────────────
// Redis-state для пагинируемого сообщения «Мои товары».
//
// Состояние одного сообщения = что сейчас отображается в нём:
//   - shop_id          — нужен чтобы валидировать что owner не сменился
//   - view             — 'categories' | 'list' | 'card'
//   - category_id      — UUID активной категории (или null)
//   - no_category      — TRUE если фильтр «Без категории»
//   - search           — текст поиска (или null)
//   - page             — номер страницы (1-based)
//   - product_id       — текущий открытый товар (только для view='card')
//
// Хранится по ключу seller:mp:<chat_id>:<message_id>, TTL 30 мин.
// Если state протух — handler покажет уровень категорий заново.
// ─────────────────────────────────────────────────────────────────

import { getRedis } from '@mahallashop/shared';

const TTL_SECONDS = 30 * 60;

function keyFor(prefix, chatId, messageId) {
  return `${prefix}mp:${chatId}:${messageId}`;
}

function currentPrefix() {
  return process.env.REDIS_PREFIX || 'seller:';
}

export async function loadState(chatId, messageId) {
  if (!chatId || !messageId) return null;
  const redis = getRedis();
  const raw = await redis.get(keyFor(currentPrefix(), chatId, messageId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveState(chatId, messageId, state) {
  if (!chatId || !messageId) return;
  const redis = getRedis();
  await redis.set(
    keyFor(currentPrefix(), chatId, messageId),
    JSON.stringify(state),
    'EX', TTL_SECONDS,
  );
}

export async function clearState(chatId, messageId) {
  if (!chatId || !messageId) return;
  const redis = getRedis();
  await redis.del(keyFor(currentPrefix(), chatId, messageId));
}
