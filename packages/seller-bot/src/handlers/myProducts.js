import { query, formatUZS } from '@mahallashop/shared';

/**
 * Показать список товаров магазина (постранично, по 10).
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
    const catName = ctx.locale === 'uz' ? p.cat_uz : p.cat_ru;
    const stockTxt = ctx.locale === 'uz'
      ? `📊 Sklada: ${p.stock}`
      : `📊 На складе: ${p.stock}`;
    const lines = [
      `*${p.name}*`,
      catName ? `${p.emoji || '📦'} ${catName}` : null,
      `💰 ${formatUZS(p.price, ctx.locale)}`,
      stockTxt,
    ].filter(Boolean).join('\n');

    if (p.photo_file_id) {
      await ctx.replyWithPhoto(p.photo_file_id, { caption: lines, parse_mode: 'Markdown' });
    } else {
      await ctx.reply(lines, { parse_mode: 'Markdown' });
    }
  }
}
