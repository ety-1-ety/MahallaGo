import { mainMenuLabels } from '../keyboards/mainMenu.js';
import { handleToggleAccepting } from './toggleAccepting.js';
import { handleMyProducts } from './myProducts.js';
import { handleStats } from './stats.js';
import { handleSettings } from './settings.js';
import { handleOrders } from './orders.js';

/**
 * Маршрутизатор reply-кнопок главного меню.
 *
 * grammY матчит входящий текст по точному совпадению.
 * Тексты кнопок локализованные, поэтому строим map динамически из ctx.t.
 */
export async function handleMainMenuMessage(ctx, next) {
  const text = ctx.message?.text;
  if (!text) return next();

  const labels = mainMenuLabels(ctx);

  // Кнопки главного меню требуют наличия магазина (или хотя бы попытки онбординга).
  if (text === labels.accepting_on || text === labels.accepting_off) {
    return handleToggleAccepting(ctx);
  }
  if (text === labels.orders) {
    return handleOrders(ctx);
  }
  if (text === labels.products) {
    return handleMyProducts(ctx);
  }
  if (text === labels.add_product) {
    if (!ctx.shop) {
      await ctx.reply(ctx.t('seller.errors.shop_not_approved'));
      return;
    }
    await ctx.conversation.enter('addProduct');
    return;
  }
  if (text === labels.stats) {
    return handleStats(ctx);
  }
  if (text === labels.settings) {
    return handleSettings(ctx);
  }

  return next();
}
