import { query, callFnRow, formatUZS } from '@mahallashop/shared';
import { InlineKeyboard } from 'grammy';

/**
 * Показать список товаров магазина с inline-кнопками управления:
 *   [💰 Цена] [📊 Остаток]
 *   [👁 Скрыть/Показать] [🗑 Удалить]
 */
export async function handleMyProducts(ctx) {
  if (!ctx.shop) return;

  const { rows } = await query(
    `SELECT p.*, c.name_ru AS cat_ru, c.name_uz AS cat_uz, c.emoji
       FROM catalog.products p
       LEFT JOIN catalog.categories c ON c.id = p.category_id
      WHERE p.shop_id = $1
        AND p.is_active = TRUE
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [ctx.shop.id],
  );

  if (rows.length === 0) {
    await ctx.reply(ctx.t('seller.products.empty'), { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply(ctx.t('seller.products.title'), { parse_mode: 'Markdown' });

  for (const p of rows) {
    const lang = ctx.locale;
    const catName = lang === 'uz' ? p.cat_uz : p.cat_ru;
    const stockTxt = lang === 'uz' ? `📊 Sklada: ${p.stock}` : `📊 На складе: ${p.stock}`;
    const lines = [
      `*${p.name}*`,
      catName ? `${p.emoji || '📦'} ${catName}` : null,
      `💰 ${formatUZS(p.price, lang)}`,
      stockTxt,
    ].filter(Boolean).join('\n');

    // is_active = TRUE по WHERE-фильтру выше, поэтому toggle всегда «скрыть».
    // Кнопка «🗑 Удалить» тоже делает soft-delete — оба варианта убирают
    // товар из списка, разница в SQL-функции (toggle/delete_product),
    // которая может в будущем повлиять на статистику.
    const kb = new InlineKeyboard()
      .text(lang === 'uz' ? '💰 Narx'    : '💰 Цена',    `prod_mgr:price:${p.id}`)
      .text(lang === 'uz' ? '📊 Qoldiq'  : '📊 Остаток', `prod_mgr:stock:${p.id}`).row()
      .text(lang === 'uz' ? '👁 Yashirish' : '👁 Скрыть',  `prod_mgr:toggle:${p.id}`)
      .text(lang === 'uz' ? '🗑 Oʻchirish' : '🗑 Удалить', `prod_mgr:delete:${p.id}`);

    if (p.photo_file_id) {
      try {
        await ctx.replyWithPhoto(p.photo_file_id, { caption: lines, parse_mode: 'Markdown', reply_markup: kb });
        continue;
      } catch { /* fallthrough на текст */ }
    }
    await ctx.reply(lines, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

/**
 * Обработка callback'ов prod_mgr:*.
 * Формат: prod_mgr:<action>:<product_id>
 *
 * Действия:
 *   price   — открыть editProduct conversation для смены цены
 *   stock   — открыть editProduct conversation для смены остатка
 *   toggle  — переключить is_active одним кликом
 *   delete  — soft-delete (один клик, без подтверждения для MVP)
 */
export async function handleProductMgrCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const [, action, productId] = data.split(':');
  if (!productId) return ctx.answerCallbackQuery();

  const { rows } = await query(
    `SELECT p.* FROM catalog.products p
      WHERE p.id = $1 AND p.shop_id = $2`,
    [productId, ctx.shop?.id],
  );
  const product = rows[0];
  if (!product) {
    await ctx.answerCallbackQuery(ctx.locale === 'uz' ? 'Topilmadi' : 'Не найдено');
    return;
  }

  if (action === 'price' || action === 'stock') {
    ctx.session.editing_product_id    = productId;
    ctx.session.editing_product_field = action;
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('editProduct');
    return;
  }

  if (action === 'toggle') {
    const next = !product.is_active;
    await callFnRow('catalog.update_product', [productId, null, null, null, null, null, null, next]);
    await ctx.answerCallbackQuery(
      next
        ? (ctx.locale === 'uz' ? '👁 Koʻrsatildi' : '👁 Показан')
        : (ctx.locale === 'uz' ? '👁 Yashirildi'   : '👁 Скрыт'),
    );
    return;
  }

  if (action === 'delete') {
    await callFnRow('catalog.delete_product', [productId]);
    await ctx.answerCallbackQuery(ctx.locale === 'uz' ? '🗑 Oʻchirildi' : '🗑 Удалён');
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch { /* старое сообщение */ }
    return;
  }
}
