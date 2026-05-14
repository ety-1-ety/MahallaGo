import { session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { getRedis } from '@mahallago/shared';

/**
 * Sessions для buyer-bot.
 *
 * Session shape:
 *   {
 *     user_id: <UUID auth.users.id>,
 *     language: 'uz' | 'ru',
 *     cart: {
 *       shop_id: <UUID> | null,
 *       items: [{ product_id, name, price, qty }, ...]
 *     },
 *     last_location: { lat, lng, ts } | null,
 *     state: 'idle' | 'browsing' | 'checkout'
 *   }
 */
export function buildSession() {
  const redis = getRedis();
  const prefix = process.env.REDIS_PREFIX || 'buyer:';
  return session({
    initial: () => ({
      user_id: null,
      language: 'uz',
      cart: { shop_id: null, items: [] },
      last_location: null,
      state: 'idle',
    }),
    storage: new RedisAdapter({
      instance: redis,
      ttl: 60 * 60 * 24 * 30,
    }),
    getSessionKey: (ctx) => {
      const id = ctx.from?.id;
      return id ? `${prefix}sess:${id}` : undefined;
    },
  });
}
