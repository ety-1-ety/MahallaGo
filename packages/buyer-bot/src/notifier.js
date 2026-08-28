import { getRedisSubscriber, query, t } from '@mahallago/shared';

/**
 * Подписка на Redis pub/sub:
 *
 *   orders:status   - публикует seller-bot после успешного update_status
 *                     payload: {
 *                       order_id,
 *                       buyer_telegram_id,
 *                       new_status,
 *                       reason?  (для rejected/cancelled)
 *                     }
 *
 * Получив сообщение - собираем локализованный текст и шлём покупателю
 * («✅ Заказ #N принят», «🚚 в пути», и т.п.).
 */
export function startBuyerNotifier(bot, log) {
  const sub = getRedisSubscriber();
  const channel = process.env.REDIS_CHANNEL_ORDER_STATUS || 'orders:status';

  sub.subscribe(channel, (err, count) => {
    if (err) {
      log.error({ err: err.message }, 'failed to subscribe orders:status');
      return;
    }
    log.info({ channels: [channel], count }, 'buyer notifier subscribed');
  });

  sub.on('message', async (ch, raw) => {
    if (ch !== channel) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      log.warn({ raw }, 'invalid pub/sub payload');
      return;
    }
    try {
      await handleOrderStatus(bot, log, payload);
    } catch (err) {
      log.error({ err: err.message, payload }, 'buyer notifier handler failed');
    }
  });
}

async function handleOrderStatus(bot, log, { order_id, buyer_telegram_id, new_status, reason }) {
  if (!order_id || !buyer_telegram_id || !new_status) return;

  // Загружаем заказ + магазин (для имени) + покупателя (для языка)
  const { rows } = await query(
    `SELECT o.number, o.status,
            s.name AS shop_name,
            u.language_code
       FROM orders.orders o
       JOIN shops.shops  s ON s.id = o.shop_id
       JOIN auth.users   u ON u.id = o.buyer_id
      WHERE o.id = $1`,
    [order_id],
  );
  const order = rows[0];
  if (!order) {
    log.warn({ order_id }, 'order not found in buyer notifier');
    return;
  }

  const lang = order.language_code || 'ru';
  const key  = `buyer.order_status_notif.${new_status}`;
  const msg  = t(lang, key, {
    number: order.number,
    shop:   order.shop_name,
    reason: reason || '—',
  });

  // Если ключа нет в i18n, t() вернёт сам ключ как fallback - не отправляем
  // мусор пользователю.
  if (msg === key) {
    log.warn({ new_status }, 'no i18n key for status notification');
    return;
  }

  try {
    await bot.api.sendMessage(buyer_telegram_id, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    log.warn({ err: err.message, buyer_telegram_id }, 'sendMessage failed');
  }
}
