import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * /start handler.
 * Если у пользователя ещё нет магазина - запускаем онбординг (conversation).
 * Если магазин есть - показываем главное меню.
 */
export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    if (!ctx.shop) {
      // Запускаем онбординг через grammY conversations
      await ctx.conversation.enter('onboarding');
      return;
    }

    // Магазин уже есть - показываем главное меню
    await ctx.reply(ctx.t('buyer.menu.title') /* у seller нет отдельного welcome - переиспользуем */, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(ctx),
    });
  });
}
