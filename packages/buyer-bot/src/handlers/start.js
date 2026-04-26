import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * /start. Если язык в session ещё не установлен — запускаем chooseLanguage.
 * Иначе показываем главное меню.
 */
export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    if (!ctx.session.language_chosen) {
      await ctx.conversation.enter('chooseLanguage');
      return;
    }

    await ctx.reply(ctx.t('buyer.menu.title'), {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(ctx),
    });
  });
}
