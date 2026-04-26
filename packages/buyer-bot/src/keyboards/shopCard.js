import { InlineKeyboard } from 'grammy';
import { formatUZS, isShopOpenNow, closeTimeToday } from '@mahallashop/shared';

/**
 * Карточка магазина для buyer-bot.
 * Возвращает { text, keyboard }.
 *
 * Пример:
 *   🏪 *Бахт-маркет*
 *   📍 120 м от вас  🟢 Открыт до 22:00
 *   💰 Мин. заказ: 30 000 сум
 *   🚚 Доставка: 5 000 сум (бесплатно от 100 000)
 *
 *   [Открыть магазин →]
 */
export function shopCard(ctx, shop) {
  const t = ctx.t;
  const lang = ctx.locale;

  const open = isShopOpenNow(shop.working_hours, shop.timezone);
  const closeTime = closeTimeToday(shop.working_hours, shop.timezone);

  const distLabel = shop.distance_m === null || shop.distance_m === undefined
    ? ''
    : (shop.distance_m < 1000
        ? t('buyer.shop_card.distance_m', { distance: Math.round(shop.distance_m) })
        : t('buyer.shop_card.distance_km', { distance: (shop.distance_m / 1000).toFixed(1) }));

  const statusLine = open && closeTime
    ? t('buyer.shop_card.open_until', { time: closeTime })
    : (open ? '🟢' : t('buyer.shop_card.closed_now'));

  const lines = [
    `🏪 *${shop.name}*`,
    [distLabel, statusLine].filter(Boolean).join('  '),
  ];

  if (Number(shop.min_order_amount) > 0) {
    lines.push(t('buyer.shop_card.min_order', { amount: formatUZS(shop.min_order_amount, lang) }));
  }

  // Доставка
  const fee = Number(shop.delivery_fee);
  const freeFrom = shop.free_delivery_from === null || shop.free_delivery_from === undefined
    ? null : Number(shop.free_delivery_from);

  if (fee === 0 && freeFrom === null) {
    lines.push(t('buyer.shop_card.delivery_always_free'));
  } else if (freeFrom !== null) {
    lines.push(t('buyer.shop_card.delivery_free_from', { amount: formatUZS(freeFrom, lang) }));
  } else {
    lines.push(t('buyer.shop_card.delivery', { fee: formatUZS(fee, lang) }));
  }

  const keyboard = new InlineKeyboard()
    .text(t('buyer.shop_card.open_button'), `shop:open:${shop.id}`);

  return { text: lines.join('\n'), keyboard };
}
