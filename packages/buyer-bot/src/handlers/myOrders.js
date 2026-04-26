import { callFn, formatUZS, tOrderStatus } from '@mahallashop/shared';

/**
 * Показать историю заказов покупателя.
 */
export async function handleMyOrders(ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  const orders = await callFn('orders.list_by_buyer', [
    ctx.user.id, null, 1, 20,
  ]);

  if (orders.length === 0) {
    await ctx.reply(t('buyer.orders.none'));
    return;
  }

  await ctx.reply(t('buyer.orders.title'), { parse_mode: 'Markdown' });

  for (const o of orders) {
    const lines = [
      t('buyer.orders.card_header', { number: o.number, shop_name: o.shop_name }),
      `${tOrderStatus(lang, o.status)}`,
      `💰 ${formatUZS(o.total, lang)}`,
    ].join('\n');
    await ctx.reply(lines, { parse_mode: 'Markdown' });
  }
}
