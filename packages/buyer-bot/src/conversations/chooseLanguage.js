import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { callFnRow, t as tFn } from '@mahallashop/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * Первичный выбор языка при /start, если ещё не выбран.
 */
async function chooseLanguageConv(conversation, ctx) {
  await ctx.reply(tFn('uz', 'language.choose_title') + '\n' + tFn('ru', 'language.choose_title'), {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard()
      .text('🇺🇿 Oʻzbekcha', 'lang:uz').row()
      .text('🇷🇺 Русский',   'lang:ru'),
  });

  const cb = await conversation.waitForCallbackQuery(/^lang:/);
  const lang = cb.callbackQuery.data.split(':')[1];
  await cb.answerCallbackQuery();

  await callFnRow('auth.set_language', [ctx.user.id, lang]);
  ctx.session.language = lang;
  ctx.session.language_chosen = true;
  ctx.locale = lang;
  ctx.t = (k, v) => tFn(lang, k, v);

  await ctx.editMessageText(tFn(lang, 'language.saved'));
  await ctx.reply(tFn(lang, 'buyer.menu.title'), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard({ ...ctx, locale: lang, t: ctx.t }),
  });
}

export const chooseLanguage = createConversation(chooseLanguageConv, 'chooseLanguage');
