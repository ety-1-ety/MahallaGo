// ioredis singleton.
//
// Использование:
//   import { getRedis, getRedisSubscriber, closeRedis } from '@mahallago/shared/redis';
//   const r = getRedis();
//   await r.set('key', 'value');
//
// Для pub/sub нужен отдельный клиент-подписчик:
//   const sub = getRedisSubscriber();
//   sub.subscribe('orders:new');
//   sub.on('message', (channel, msg) => ...);

import Redis from 'ioredis';

let _client = null;
let _subscriber = null;

function buildOptions(prefix) {
  return {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    keyPrefix: prefix || undefined,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  };
}

export function getRedis() {
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL не задан. Невозможно создать ioredis клиент');
  }

  _client = new Redis(url, buildOptions(process.env.REDIS_PREFIX));

  _client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis] error:', err.message);
  });

  return _client;
}

/**
 * Возвращает отдельный клиент для подписки на pub/sub.
 * ioredis НЕ позволяет использовать обычный клиент для команд после
 * подписки, поэтому нужен второй.
 *
 * keyPrefix НЕ применяется к pub/sub каналам - они идут напрямую.
 */
export function getRedisSubscriber() {
  if (_subscriber) return _subscriber;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL не задан. Невозможно создать ioredis subscriber');
  }

  _subscriber = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: null,  // у subscriber-ов команды нет, retry бесконечный
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  _subscriber.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis sub] error:', err.message);
  });

  return _subscriber;
}

export async function closeRedis() {
  const tasks = [];
  if (_client) {
    const c = _client;
    _client = null;
    tasks.push(c.quit().catch(() => c.disconnect()));
  }
  if (_subscriber) {
    const s = _subscriber;
    _subscriber = null;
    tasks.push(s.quit().catch(() => s.disconnect()));
  }
  await Promise.allSettled(tasks);
}
