import { createConversation } from '@grammyjs/conversations';
import { Keyboard } from 'grammy';
import { callFnRow } from '@mahallashop/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * Универсальный редактор одного поля товара.
 * Поле и id товара хранятся в session перед conversation.enter('editProduct').
 *
 * Поддерживаемые поля:
 *   price  — цена (число)
 *   stock  — остаток (целое неотрицательное)
 */
async function editProductConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;
  const productId = ctx.session.editing_product_id;
  const field = ctx.session.editing_product_field;

  if (!productId || !field) {
    await ctx.reply(t('common.error_unknown'));
    return;
  }

  const promptKey = field === 'price'
    ? (lang === 'uz' ? '💰 Yangi narxni kiriting (soʻm):' : '💰 Введите новую цену (сум):')
    : (lang === 'uz' ? '📊 Yangi qoldiqni kiriting:'      : '📊 Введите новый остаток:');

  await ctx.reply(promptKey, {
    reply_markup: new Keyboard().text(t('common.cancel')).resized().oneTime(),
  });

  let value = null;
  let lastCtx = ctx;
  while (value === null) {
    const m = await conversation.waitFor('message:text');
    lastCtx = m;
    const txt = m.message.text.trim();

    if (txt === t('common.cancel')) {
      delete m.session.editing_product_id;
      delete m.session.editing_product_field;
      await m.reply(t('common.cancelled'), { reply_markup: mainMenuKeyboard(ctx) });
      return;
    }

    if (field === 'price') {
      const cleaned = txt.replace(/\s+/g, '').replace(',', '.');
      const n = Number(cleaned);
      if (Number.isFinite(n) && n >= 0 && n < 1e10) {
        value = Math.round(n * 100) / 100;
      } else {
        await m.reply(lang === 'uz' ? '❌ Notoʻgʻri narx. Faqat raqam.' : '❌ Неверная цена. Только число.');
      }
    } else {
      // stock
      const n = Number(txt);
      if (Number.isInteger(n) && n >= 0 && n < 1e7) {
        value = n;
      } else {
        await m.reply(lang === 'uz' ? '❌ Notoʻgʻri miqdor. Butun son.' : '❌ Неверное число. Целое.');
      }
    }
  }

  // INSERT через external — replay не должен повторно дёрнуть SQL.
  await conversation.external(() => callFnRow('catalog.update_product', [
    productId,
    null, null, null, null,
    field === 'price' ? value : null,
    field === 'stock' ? value : null,
    null,
  ]));

  delete lastCtx.session.editing_product_id;
  delete lastCtx.session.editing_product_field;
  await lastCtx.reply(
    lang === 'uz' ? '✅ Yangilandi' : '✅ Обновлено',
    { reply_markup: mainMenuKeyboard(ctx) },
  );
}

export const editProduct = createConversation(editProductConv, 'editProduct');
