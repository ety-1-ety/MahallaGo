import { InlineKeyboard } from 'grammy';
import { callFn, callFnRow, query, formatUZS, tOrderStatus, getRedis, formatPhone } from '@mahallago/shared';
import { orderCardKeyboard } from '../keyboards/orderCard.js';
import { mainMenuLabels } from '../keyboards/mainMenu.js';

/**
 * Уведомить покупателя о смене статуса заказа через Redis pub/sub.
 * buyer-bot подписан на канал и шлёт локализованное сообщение.
 *
 * Отдельная функция чтобы не путать с прямым ответом в Telegram —
 * pub/sub нужен потому что seller-bot и buyer-bot работают как
 * разные процессы с разными bot-токенами.
 */
async function publishStatusUpdate(orderId, newStatus, reason) {
  try {
    // Найдём telegram_id покупателя по заказу.
    const { rows } = await query(
      `SELECT u.telegram_id
         FROM orders.orders o
         JOIN auth.users u ON u.id = o.buyer_id
        WHERE o.id = $1`,
      [orderId],
    );
    const buyerTgId = rows[0]?.telegram_id;
    if (!buyerTgId) return;

    const redis = getRedis();
    const channel = process.env.REDIS_CHANNEL_ORDER_STATUS || 'orders:status';
    await redis.publish(channel, JSON.stringify({
      order_id: orderId,
      buyer_telegram_id: Number(buyerTgId),
      new_status: newStatus,
      reason: reason || null,
    }));
  } catch { /* не критично — buyer увидит статус при следующем открытии «Мои заказы» */ }
}

const ACTIVE_STATUSES = ['pending', 'accepted', 'ready', 'delivering'];

/**
 * Показать активные заказы магазина (по 5 свежих).
 */
export async function handleOrders(ctx) {
  if (!ctx.shop) return;

  // Берём активные заказы (без completed/rejected/cancelled)
  const { rows } = await query(
    `SELECT o.id, o.number, o.subtotal, o.delivery_fee, o.total,
            o.delivery_address, o.distance_m, o.status, o.created_at,
            u.first_name AS buyer_first_name, u.phone AS buyer_phone
       FROM orders.orders o
       JOIN auth.users u ON u.id = o.buyer_id
      WHERE o.shop_id = $1
        AND o.status = ANY($2::orders.order_status[])
      ORDER BY o.created_at DESC
      LIMIT 10`,
    [ctx.shop.id, ACTIVE_STATUSES],
  );

  if (rows.length === 0) {
    await ctx.reply(ctx.locale === 'uz' ? '✅ Faol buyurtmalar yoʻq' : '✅ Активных заказов нет');
    return;
  }

  for (const o of rows) {
    await sendOrderCard(ctx, o);
  }
}

/**
 * Отправить карточку заказа. Используется и из /orders, и из notifier.
 */
export async function sendOrderCard(ctx, order, opts = {}) {
  const lang = ctx.locale;
  const items = await fetchItems(order.id);

  const itemsTxt = items.map((i) =>
    `• ${i.product_name} × ${i.qty}  →  ${formatUZS(i.line_total, lang)}`,
  ).join('\n');

  const distLabel = order.distance_m === null || order.distance_m === undefined
    ? ''
    : (order.distance_m < 1000
        ? `${order.distance_m} ${lang === 'uz' ? 'm' : 'м'}`
        : `${(order.distance_m / 1000).toFixed(1)} ${lang === 'uz' ? 'km' : 'км'}`);

  const lines = [
    ctx.t('seller.new_order_notif.title', { number: order.number }),
    '',
    ctx.t('seller.new_order_notif.buyer', { name: order.buyer_first_name || '—' }),
    ctx.t('seller.new_order_notif.phone', { phone: formatPhone(order.buyer_phone) }),
    ctx.t('seller.new_order_notif.address', {
      address: order.delivery_address,
      distance: distLabel,
    }),
    '',
    ctx.t('seller.new_order_notif.items_header'),
    itemsTxt,
    '─────',
    `${ctx.t('seller.new_order_notif.subtotal')}  ${formatUZS(order.subtotal, lang)}`,
    `${ctx.t('seller.new_order_notif.delivery')}  ${formatUZS(order.delivery_fee, lang)}`,
    ctx.t('seller.new_order_notif.total', { amount: formatUZS(order.total, lang) }),
    '',
    `${tOrderStatus(lang, order.status)}`,
  ].join('\n');

  const kb = orderCardKeyboard(ctx, order);

  await ctx.reply(lines, {
    parse_mode: 'Markdown',
    reply_markup: kb || undefined,
    ...(opts.replyOptions || {}),
  });
}

async function fetchItems(orderId) {
  const { rows } = await query(
    'SELECT product_name, qty, unit_price, line_total FROM orders.order_items WHERE order_id = $1 ORDER BY created_at',
    [orderId],
  );
  return rows;
}

/**
 * Обработка callback-кнопок жизненного цикла заказа.
 * Регистрируется в index.js через bot.callbackQuery(/^order:.../, ...).
 */
export async function handleOrderCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [, action, orderId] = data.split(':');
  if (!orderId) return ctx.answerCallbackQuery();

  // Отмена режима reject — обрабатывается ПЕРВОЙ, до маппинга в статус,
  // т.к. reject_cancel не входит в statusMap.
  if (action === 'reject_cancel') {
    delete ctx.session.rejecting_order_id;
    await ctx.answerCallbackQuery(
      ctx.locale === 'uz' ? '↩️ Bekor qilindi' : '↩️ Отменено',
    );
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    return;
  }

  // Маппинг action → новый статус
  const statusMap = {
    accept:     'accepted',
    reject:     'rejected',
    ready:      'ready',
    delivering: 'delivering',
    completed:  'completed',
  };
  const newStatus = statusMap[action];
  if (!newStatus) return ctx.answerCallbackQuery();

  // Для reject спросим причину через короткий prompt
  if (newStatus === 'rejected') {
    // Сохраним order_id в session и попросим написать причину.
    // Inline-кнопка отмены позволяет выйти из режима без отправки текста.
    ctx.session.rejecting_order_id = orderId;
    await ctx.answerCallbackQuery();
    await ctx.reply(
      ctx.locale === 'uz'
        ? '❌ Rad etish sababini yozing:'
        : '❌ Напишите причину отклонения:',
      {
        reply_markup: new InlineKeyboard().text(
          ctx.t('common.cancel'),
          `order:reject_cancel:${orderId}`,
        ),
      },
    );
    return;
  }

  try {
    const updated = await callFnRow('orders.update_status', [
      orderId, newStatus, ctx.user.id, null,
    ]);
    await ctx.answerCallbackQuery(
      ctx.locale === 'uz' ? 'Yangilandi ✓' : 'Обновлено ✓',
    );
    // Уведомление покупателю через pub/sub.
    await publishStatusUpdate(orderId, newStatus, null);
    // Обновим карточку: новая клавиатура (или удалим если финал)
    const newKb = orderCardKeyboard(ctx, updated);
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: newKb || undefined });
    } catch { /* сообщение могло быть слишком старым */ }
  } catch (err) {
    await ctx.answerCallbackQuery(err.code || 'error');
  }
}

/**
 * Если в session.rejecting_order_id есть id — следующее текстовое
 * сообщение трактуем как причину отклонения.
 *
 * Тексты главного меню НЕ принимаются как причина — иначе нажатие на
 * любую reply-кнопку («🛒 Заказы», «⚙️ Настройки», и т.п.) во время
 * ожидания причины случайно отклонило бы заказ.
 */
export async function handleRejectReason(ctx, next) {
  const orderId = ctx.session?.rejecting_order_id;
  if (!orderId || !ctx.message?.text) return next();

  const reason = ctx.message.text.trim();

  // Защита: текст совпал с reply-кнопкой главного меню → не причина,
  // выходим из режима и пропускаем сообщение в обычный router.
  const labels = Object.values(mainMenuLabels(ctx));
  if (labels.includes(reason)) {
    delete ctx.session.rejecting_order_id;
    return next();
  }

  if (reason.length < 2) {
    await ctx.reply(ctx.locale === 'uz'
      ? '❌ Sabab juda qisqa.' : '❌ Слишком короткая причина.');
    return;
  }

  try {
    await callFnRow('orders.update_status', [orderId, 'rejected', ctx.user.id, reason]);
    // Уведомляем покупателя с причиной отказа.
    await publishStatusUpdate(orderId, 'rejected', reason);
    delete ctx.session.rejecting_order_id;
    await ctx.reply(ctx.locale === 'uz'
      ? '✅ Buyurtma rad etildi'
      : '✅ Заказ отклонён');
  } catch (err) {
    await ctx.reply(err.code || ctx.t('common.error_unknown'));
    delete ctx.session.rejecting_order_id;
  }
}
