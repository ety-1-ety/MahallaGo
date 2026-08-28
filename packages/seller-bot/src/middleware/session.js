import { session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { getRedis } from '@mahallago/shared';

/**
 * Sessions для grammY на Redis.
 *
 * Session shape:
 *   {
 *     user_id: <UUID auth.users.id>,         // заполняется auth-middleware
 *     language: 'uz' | 'ru',
 *     shop_id: <UUID shops.shops.id> | null, // активный магазин продавца
 *     state: 'idle' | 'editing' | 'onboarding' | ...
 *   }
 */
export function buildSession() {
  const redis = getRedis();
  const prefix = process.env.REDIS_PREFIX || 'seller:';
  return session({
    initial: () => ({
      user_id: null,
      language: 'uz',
      shop_id: null,
      state: 'idle',
    }),
    storage: new RedisAdapter({
      instance: redis,
      // отдельное пространство имён внутри keyPrefix Redis-клиента
      ttl: 60 * 60 * 24 * 30,  // 30 дней
    }),
    getSessionKey: (ctx) => {
      // Один пользователь может писать боту в нескольких чатах - но
      // у seller-bot всегда личка, поэтому ключ от user.id достаточно.
      const id = ctx.from?.id;
      return id ? `${prefix}sess:${id}` : undefined;
    },
  });
}
