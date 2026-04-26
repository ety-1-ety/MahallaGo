import { query } from '@mahallashop/shared';
import { cartView } from '../keyboards/cartView.js';

/**
 * Показать корзину.
 */
export async function handleCart(ctx) {
  const cart = ctx.session.cart;

  if (!cart || !cart.items || cart.items.length === 0) {
    await ctx.reply(ctx.t('buyer.cart.empty'));
    return;
  }

  const { rows } = await query('SELECT * FROM shops.shops WHERE id = $1', [cart.shop_id]);
  const shop = rows[0];

  const view = cartView(ctx, shop);
  await ctx.reply(view.text, {
    parse_mode: 'Markdown',
    reply_markup: view.keyboard || undefined,
  });
}

/**
 * Очистить корзину.
 */
export async function handleClearCart(ctx) {
  ctx.session.cart = { shop_id: null, items: [] };
  await ctx.answerCallbackQuery(ctx.t('buyer.cart.cleared'));
  try {
    await ctx.editMessageText(ctx.t('buyer.cart.empty'));
  } catch { /* ignore */ }
}

/**
 * Обработчик callback-кнопок корзины.
 */
export async function handleCartCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'cart:clear') {
    return handleClearCart(ctx);
  }

  if (data === 'cart:show') {
    await ctx.answerCallbackQuery();
    return handleCart(ctx);
  }

  if (data === 'cart:edit') {
    // Возвращаем пользователя в просмотр магазина
    const cart = ctx.session.cart;
    await ctx.answerCallbackQuery();
    if (cart?.shop_id) {
      const { rows } = await query('SELECT id FROM shops.shops WHERE id = $1', [cart.shop_id]);
      if (rows[0]) {
        const { handleOpenShop } = await import('./browseShop.js');
        return handleOpenShop(ctx, rows[0].id);
      }
    }
    await ctx.reply(ctx.t('buyer.cart.empty'));
    return;
  }

  if (data === 'cart:checkout') {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('checkout');
    return;
  }
}
