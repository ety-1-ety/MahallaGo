import { getRedis, query } from '@mahallashop/shared';

/**
 * Публикует событие модерации в канал shops:moderation.
 * seller-bot подписан и пришлёт уведомление владельцу.
 */
export async function notifyShopModeration({ shopId, action, reason }) {
  const redis = getRedis();
  const channel = process.env.REDIS_CHANNEL_MODERATION || 'shops:moderation';

  // Получаем telegram_id владельца
  const { rows } = await query(
    `SELECT u.telegram_id
       FROM shops.shops s
       JOIN auth.users  u ON u.id = s.owner_id
      WHERE s.id = $1`,
    [shopId],
  );
  const ownerTgId = rows[0]?.telegram_id;
  if (!ownerTgId) return;

  await redis.publish(channel, JSON.stringify({
    shop_id: shopId,
    action,
    owner_telegram_id: ownerTgId,
    reason: reason || null,
  }));
}
