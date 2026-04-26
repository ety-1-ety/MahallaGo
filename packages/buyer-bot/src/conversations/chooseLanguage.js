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

  // UPDATE через external — replay не должен повторно дёргать БД.
  await conversation.external(() => callFnRow('auth.set_language', [ctx.user.id, lang]));

  // ВАЖНО: мутируем сессию через cb, а НЕ ctx.
  // ctx в grammY conversations 1.x — это исходный контекст, мутации
  // его session не персистятся. Сохраняется session ПОСЛЕДНЕГО wait-ctx (cb).
  cb.session.language = lang;
  cb.session.language_chosen = true;
  cb.locale = lang;
  cb.t = (k, v) => tFn(lang, k, v);

  // Редактируем сообщение тоже через cb — иначе попытается отредактировать
  // /start пользователя, на что Telegram отвечает ошибкой.
  await cb.editMessageText(tFn(lang, 'language.saved'));
  await cb.reply(tFn(lang, 'buyer.menu.title'), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard({ locale: lang, t: cb.t }),
  });
}

export const chooseLanguage = createConversation(chooseLanguageConv, 'chooseLanguage');
