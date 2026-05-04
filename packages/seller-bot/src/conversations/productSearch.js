// ─────────────────────────────────────────────────────────────────
// Поиск товаров продавцом — короткий conversation на 1 шаг.
//
// Вход через mp:search:enter; в ctx.session.product_search хранится
// контекст (chat_id, message_id, category_id, no_category) — после
// получения текста передаём управление обратно в myProducts.applySearchQuery,
// которая откроет отфильтрованный список на месте старого сообщения.
// ─────────────────────────────────────────────────────────────────

import { createConversation } from '@grammyjs/conversations';
import { Keyboard } from 'grammy';
import { applySearchQuery } from '../handlers/myProducts.js';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

async function productSearchConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  await ctx.reply(t('seller.products.search_prompt'), {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.cancel')).resized().persistent(),
  });

  while (true) {
    const m = await conversation.waitFor('message:text');
    const txt = m.message.text.trim();

    if (txt === t('common.cancel')) {
      await m.reply(t('common.cancelled'), { reply_markup: mainMenuKeyboard(ctx) });
      // Очищаем «хвост» из сессии — иначе при следующем поиске данные старого мс перепутаются.
      delete m.session.product_search;
      return;
    }

    if (txt.length < 1) {
      await m.reply(lang === 'uz'
        ? '❌ Soʻrov boʻsh boʻlmasin.'
        : '❌ Запрос не должен быть пустым.');
      continue;
    }
    if (txt.length > 64) {
      await m.reply(lang === 'uz'
        ? '❌ Juda uzun (maks. 64 belgi).'
        : '❌ Слишком длинный (макс. 64 символа).');
      continue;
    }

    // Возвращаем главное меню (нижнюю клавиатуру) и сразу отрисовываем
    // список с фильтром поиска через applySearchQuery.
    await m.reply(t('seller.products.search_applied', { query: txt }), {
      reply_markup: mainMenuKeyboard(ctx),
    });
    // applySearchQuery читает ctx.session.product_search и сама её удалит.
    await applySearchQuery(m, txt);
    return;
  }
}

export const productSearch = createConversation(productSearchConv, 'productSearch');
