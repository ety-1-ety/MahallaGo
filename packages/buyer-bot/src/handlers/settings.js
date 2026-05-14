import { InlineKeyboard } from 'grammy';
import { callFnRow, t as tFn } from '@mahallago/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * Настройки покупателя — пока только переключение языка.
 */
export async function handleSettings(ctx) {
  const t = ctx.t;
  const kb = new InlineKeyboard()
    .text(t('language.choose_uz'), 'lang:uz').row()
    .text(t('language.choose_ru'), 'lang:ru');
  await ctx.reply(t('language.choose_title'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

export async function handleLanguageCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith('lang:')) return;
  const lang = data.split(':')[1];
  if (lang !== 'uz' && lang !== 'ru') {
    await ctx.answerCallbackQuery();
    return;
  }

  await callFnRow('auth.set_language', [ctx.user.id, lang]);
  ctx.session.language = lang;
  ctx.session.language_chosen = true;
  ctx.locale = lang;
  ctx.t      = (key, vars) => tFn(lang, key, vars);

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(tFn(lang, 'language.saved'));
  await ctx.reply(tFn(lang, 'buyer.menu.title'), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard({ ...ctx, locale: lang, t: (k, v) => tFn(lang, k, v) }),
  });
}
