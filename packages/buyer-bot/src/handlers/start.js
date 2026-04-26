import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * /start. Запускает регистрацию (chooseLanguage), если:
 *   1) язык ещё не выбран, ИЛИ
 *   2) у покупателя нет телефона (нужен продавцу для связи).
 * Иначе — показываем главное меню.
 *
 * chooseLanguage сам пропускает уже завершённые шаги, поэтому
 * существующему пользователю без телефона прилетит только phone-step.
 */
export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    if (!ctx.session.language_chosen || !ctx.user?.phone) {
      await ctx.conversation.enter('chooseLanguage');
      return;
    }

    await ctx.reply(ctx.t('buyer.menu.title'), {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(ctx),
    });
  });
}
