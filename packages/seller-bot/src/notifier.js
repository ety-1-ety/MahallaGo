import { getRedisSubscriber, query, t, tError, formatUZS, tOrderStatus, formatPhone } from '@mahallashop/shared';
import { orderCardKeyboard } from './keyboards/orderCard.js';

/**
 * Подписка на Redis pub/sub каналы:
 *
 *   orders:new        — публикует buyer-bot после успешного create_order
 *                       payload: { order_id, shop_id, owner_telegram_id }
 *   shops:moderation  — публикует admin-api при approve/reject/suspend
 *                       payload: { shop_id, action, owner_telegram_id, reason? }
 *
 * При получении сообщения находим Telegram-аккаунт владельца магазина
 * (через owner_telegram_id) и отправляем ему уведомление.
 */
export function startNotifier(bot, log) {
  const sub = getRedisSubscriber();
  const channelOrders = process.env.REDIS_CHANNEL_NEW_ORDER  || 'orders:new';
  const channelMod    = process.env.REDIS_CHANNEL_MODERATION || 'shops:moderation';

  sub.subscribe(channelOrders, channelMod, (err, count) => {
    if (err) {
      log.error({ err: err.message }, 'failed to subscribe');
      return;
    }
    log.info({ channels: [channelOrders, channelMod], count }, 'notifier subscribed');
  });

  sub.on('message', async (channel, raw) => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      log.warn({ channel, raw }, 'invalid pub/sub payload');
      return;
    }

    try {
      if (channel === channelOrders) {
        await handleNewOrder(bot, log, payload);
      } else if (channel === channelMod) {
        await handleModeration(bot, log, payload);
      }
    } catch (err) {
      log.error({ err: err.message, channel, payload }, 'notifier handler failed');
    }
  });
}

async function handleNewOrder(bot, log, { order_id, owner_telegram_id }) {
  if (!order_id || !owner_telegram_id) return;

  // Загружаем заказ + покупателя + магазин (для языка владельца)
  const { rows: orderRows } = await query(
    `SELECT o.*, u.first_name AS buyer_first_name, u.phone AS buyer_phone
       FROM orders.orders o
       JOIN auth.users u ON u.id = o.buyer_id
      WHERE o.id = $1`,
    [order_id],
  );
  const order = orderRows[0];
  if (!order) {
    log.warn({ order_id }, 'order not found in notifier');
    return;
  }

  const { rows: ownerRows } = await query(
    'SELECT id, telegram_id, language_code FROM auth.users WHERE telegram_id = $1',
    [owner_telegram_id],
  );
  const owner = ownerRows[0];
  if (!owner) return;

  const { rows: itemRows } = await query(
    'SELECT product_name, qty, line_total FROM orders.order_items WHERE order_id = $1 ORDER BY created_at',
    [order_id],
  );

  const lang = owner.language_code || 'uz';
  const itemsTxt = itemRows.map((i) =>
    `• ${i.product_name} × ${i.qty}  →  ${formatUZS(i.line_total, lang)}`,
  ).join('\n');

  const distLabel = order.distance_m === null || order.distance_m === undefined
    ? ''
    : (order.distance_m < 1000
        ? `${order.distance_m} ${lang === 'uz' ? 'm' : 'м'}`
        : `${(order.distance_m / 1000).toFixed(1)} ${lang === 'uz' ? 'km' : 'км'}`);

  const lines = [
    t(lang, 'seller.new_order_notif.title', { number: order.number }),
    '',
    t(lang, 'seller.new_order_notif.buyer', { name: order.buyer_first_name || '—' }),
    t(lang, 'seller.new_order_notif.phone', { phone: formatPhone(order.buyer_phone) }),
    t(lang, 'seller.new_order_notif.address', {
      address: order.delivery_address,
      distance: distLabel,
    }),
    '',
    t(lang, 'seller.new_order_notif.items_header'),
    itemsTxt,
    '─────',
    `${t(lang, 'seller.new_order_notif.subtotal')}  ${formatUZS(order.subtotal, lang)}`,
    `${t(lang, 'seller.new_order_notif.delivery')}  ${formatUZS(order.delivery_fee, lang)}`,
    t(lang, 'seller.new_order_notif.total', { amount: formatUZS(order.total, lang) }),
  ].join('\n');

  // Собираем inline-клавиатуру вне ctx
  const fakeCtx = { locale: lang, t: (k, v) => t(lang, k, v) };
  const kb = orderCardKeyboard(fakeCtx, order);

  await bot.api.sendMessage(owner_telegram_id, lines, {
    parse_mode: 'Markdown',
    reply_markup: kb || undefined,
  });
}

async function handleModeration(bot, log, { action, owner_telegram_id, reason }) {
  if (!owner_telegram_id || !action) return;

  const { rows } = await query(
    'SELECT language_code FROM auth.users WHERE telegram_id = $1',
    [owner_telegram_id],
  );
  const lang = rows[0]?.language_code || 'uz';

  let key;
  switch (action) {
    case 'approve':  key = 'seller.moderation.approved'; break;
    case 'reject':   key = 'seller.moderation.rejected'; break;
    case 'suspend':  key = 'seller.moderation.suspended'; break;
    default: return;
  }

  const text = t(lang, key, { reason: reason || '—' });
  await bot.api.sendMessage(owner_telegram_id, text, { parse_mode: 'Markdown' });
}
