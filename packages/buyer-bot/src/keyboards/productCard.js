import { InlineKeyboard } from 'grammy';
import { formatUZS } from '@mahallago/shared';

/**
 * Карточка товара с кнопками [➖] qty [➕] [🛒].
 *
 *   *Хлеб лепёшка*
 *   Свежая, выпекается каждое утро
 *   💰 5 000 сум  •  📦 В наличии
 *
 *   [➖] 1 [➕]  [🛒 В корзину]
 */
export function productCard(ctx, product, currentQty = 0) {
  const t = ctx.t;
  const lang = ctx.locale;

  const stockLine = product.stock > 0
    ? (lang === 'uz' ? '📦 Mavjud' : '📦 В наличии')
    : (lang === 'uz' ? '🚫 Tugagan'  : '🚫 Закончилось');

  const lines = [
    `*${product.name}*`,
    product.description ? product.description : null,
    `💰 ${formatUZS(product.price, lang)}  •  ${stockLine}`,
  ].filter(Boolean).join('\n');

  const kb = new InlineKeyboard();
  if (product.stock > 0) {
    const newDec = Math.max(currentQty - 1, 0);
    const newInc = Math.min(currentQty + 1, product.stock);
    kb.text('➖', `prod:dec:${product.id}`)
      .text(`${currentQty}`, `prod:noop`)
      .text('➕', `prod:inc:${product.id}`)
      .row()
      .text(currentQty > 0
        ? (lang === 'uz' ? '🛒 Savatchada ✓' : '🛒 В корзине ✓')
        : (lang === 'uz' ? '🛒 Savatchaga'   : '🛒 В корзину'),
        `prod:add:${product.id}`);
    // Подавим неиспользуемые переменные
    void newDec; void newInc;
  }

  return { text: lines, keyboard: kb };
}

/**
 * Карточка категории внутри магазина (кнопка-категория для меню).
 */
export function categoriesInline(ctx, categories) {
  const lang = ctx.locale;
  const kb = new InlineKeyboard();
  for (const c of categories) {
    const name = lang === 'uz' ? c.name_uz : c.name_ru;
    kb.text(`${c.emoji || '📦'} ${name} (${c.product_count})`, `cat:${c.id}`).row();
  }
  return kb;
}
