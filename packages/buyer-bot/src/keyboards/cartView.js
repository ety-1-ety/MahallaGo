import { InlineKeyboard } from 'grammy';
import { formatUZS } from '@mahallashop/shared';

/**
 * Отрисовать корзину как карточку с inline-кнопками.
 * Корзина ссылается на один shop_id (из session.cart.shop_id).
 */
export function cartView(ctx, shop) {
  const t = ctx.t;
  const lang = ctx.locale;
  const cart = ctx.session.cart;

  if (!cart || !cart.items || cart.items.length === 0) {
    return {
      text: t('buyer.cart.empty'),
      keyboard: null,
    };
  }

  const lines = [
    t('buyer.cart.title', { shop_name: shop?.name || '' }),
    '',
  ];

  let subtotal = 0;
  for (const it of cart.items) {
    const lineTotal = Number(it.price) * Number(it.qty);
    subtotal += lineTotal;
    lines.push(`• ${it.name} × ${it.qty}  →  ${formatUZS(lineTotal, lang)}`);
  }

  // Эффективная стоимость доставки (расчёт зеркалит логику create_order)
  let deliveryFee = Number(shop?.delivery_fee || 0);
  if (shop?.free_delivery_from !== null && shop?.free_delivery_from !== undefined
      && subtotal >= Number(shop.free_delivery_from)) {
    deliveryFee = 0;
  }
  const total = subtotal + deliveryFee;

  lines.push('─────────────────────');
  lines.push(`${t('buyer.cart.subtotal')}  ${formatUZS(subtotal, lang)}`);
  lines.push(`${t('buyer.cart.delivery')}  ${formatUZS(deliveryFee, lang)}`);
  lines.push(`${t('buyer.cart.total')}  ${formatUZS(total, lang)}`);

  const kb = new InlineKeyboard()
    .text(t('buyer.cart.edit'),     'cart:edit')
    .text(t('buyer.cart.clear'),    'cart:clear').row()
    .text(t('buyer.cart.checkout'), 'cart:checkout');

  return { text: lines.join('\n'), keyboard: kb };
}
