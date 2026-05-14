import { getRedis } from '@mahallago/shared';

export function buildRateLimit(log, perSec = 10) {
  const redis = getRedis();
  const prefix = process.env.REDIS_PREFIX || 'buyer:';

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

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
        return;
      }
    } catch (err) {
      log.warn({ err: err.message }, 'rate limit redis error, skipping');
    }

    return next();
  };
}
