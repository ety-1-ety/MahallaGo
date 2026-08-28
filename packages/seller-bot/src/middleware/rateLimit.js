import { getRedis } from '@mahallago/shared';

/**
 * Sliding-window rate limit через Redis.
 * При превышении лимита - silent drop (без ответа), чтобы не давать спамеру
 * ещё одну причину писать.
 *
 * @param {object} log - pino logger
 * @param {number} perSec - макс. запросов в секунду на пользователя
 */
export function buildRateLimit(log, perSec = 10) {
  const redis = getRedis();
  const prefix = process.env.REDIS_PREFIX || 'seller:';

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    // Простая sliding-window: ZADD timestamp, ZREMRANGEBYSCORE старше 1с,
    // ZCARD → если > perSec, дропаем.
    const key = `${prefix}rl:${userId}`;
    const now = Date.now();
    const windowMs = 1000;

    try {
      const pipeline = redis.pipeline();
      pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
      pipeline.zremrangebyscore(key, 0, now - windowMs);
      pipeline.zcard(key);
      pipeline.pexpire(key, windowMs * 2);
      const results = await pipeline.exec();
      const count = results?.[2]?.[1] ?? 0;

      if (count > perSec) {
        log.warn({ user_id: userId, count }, 'rate limit hit');
        return;  // silent drop
      }
    } catch (err) {
      // Если Redis отвалился - пропускаем, не блокируем работу бота
      log.warn({ err: err.message }, 'rate limit redis error, skipping');
    }

    return next();
  };
}
