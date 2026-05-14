import { query } from '@mahallago/shared';
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
  delete ctx.session.cart_reminder_msg_id;
  await ctx.answerCallbackQuery(ctx.t('buyer.cart.cleared'));
  try {
    await ctx.editMessageText(ctx.t('buyer.cart.empty'));
  } catch { /* ignore */ }
}

/**
 * Обновить inline-клавиатуру и текст корзины после изменения количества.
 * Используется в обработчиках cart:dec / cart:inc / cart:rm.
 */
async function refreshCartMessage(ctx) {
  const cart = ctx.session.cart;
  if (!cart || !cart.items || cart.items.length === 0) {
    try { await ctx.editMessageText(ctx.t('buyer.cart.empty')); } catch {}
    return;
  }
  const { rows } = await query('SELECT * FROM shops.shops WHERE id = $1', [cart.shop_id]);
  const shop = rows[0];
  const view = cartView(ctx, shop);
  try {
    await ctx.editMessageText(view.text, {
      parse_mode: 'Markdown',
      reply_markup: view.keyboard || undefined,
    });
  } catch { /* старое сообщение или текст не изменился */ }
}

/**
 * Обработчик callback-кнопок корзины.
 *   cart:show         — показать корзину (из reminder под товарами)
 *   cart:edit         — вернуться в магазин для добавления товаров
 *   cart:clear        — очистить
 *   cart:checkout     — оформить заказ (заходим в checkout conversation)
 *   cart:dec:<pid>    — qty -= 1, если 0 — удалить
 *   cart:inc:<pid>    — qty += 1 (с проверкой stock из БД)
 *   cart:rm:<pid>     — удалить товар из корзины
 *   cart:noop         — кнопка-подпись (имя/qty), ответ просто закрывает toast
 */
export async function handleCartCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'cart:noop') {
    return ctx.answerCallbackQuery();
  }

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

  // ── Изменение количества/удаление позиции ──────────────────
  const [, action, productId] = data.split(':');
  if (!productId || !['dec', 'inc', 'rm'].includes(action)) {
    return ctx.answerCallbackQuery();
  }

  const cart = ctx.session.cart;
  if (!cart || !cart.items) {
    return ctx.answerCallbackQuery();
  }

  const idx = cart.items.findIndex((i) => i.product_id === productId);
  if (idx === -1) {
    await ctx.answerCallbackQuery(
      ctx.locale === 'uz' ? 'Topilmadi' : 'Не найдено',
    );
    return;
  }
  const item = cart.items[idx];

  if (action === 'rm') {
    cart.items.splice(idx, 1);
    if (cart.items.length === 0) cart.shop_id = null;
    ctx.session.cart = cart;
    await ctx.answerCallbackQuery(
      ctx.locale === 'uz' ? '🗑 Olib tashlandi' : '🗑 Удалено',
    );
    return refreshCartMessage(ctx);
  }

  if (action === 'dec') {
    item.qty -= 1;
    if (item.qty <= 0) cart.items.splice(idx, 1);
    if (cart.items.length === 0) cart.shop_id = null;
    ctx.session.cart = cart;
    await ctx.answerCallbackQuery();
    return refreshCartMessage(ctx);
  }

  if (action === 'inc') {
    // Проверим stock в БД, чтобы не превысить наличие
    const { rows } = await query(
      'SELECT stock FROM catalog.products WHERE id = $1 AND is_active = TRUE',
      [productId],
    );
    const stock = Number(rows[0]?.stock ?? 0);
    if (item.qty + 1 > stock) {
      await ctx.answerCallbackQuery(
        ctx.locale === 'uz' ? '⚠️ Omborda yetarli emas' : '⚠️ Не хватает на складе',
      );
      return;
    }
    item.qty += 1;
    ctx.session.cart = cart;
    await ctx.answerCallbackQuery();
    return refreshCartMessage(ctx);
  }
}
