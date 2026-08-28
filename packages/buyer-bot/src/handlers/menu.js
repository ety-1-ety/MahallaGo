import { mainMenuKeyboard, mainMenuLabels } from '../keyboards/mainMenu.js';
import { askLocation } from './findShops.js';
import { handleCart } from './cart.js';
import { handleMyOrders } from './myOrders.js';
import { handleSettings } from './settings.js';

export async function handleMainMenuMessage(ctx, next) {
  const text = ctx.message?.text;
  if (!text) return next();

  const labels = mainMenuLabels(ctx);

  if (text === labels.find_shops) return askLocation(ctx);
  if (text === labels.cart)       return handleCart(ctx);
  if (text === labels.my_orders)  return handleMyOrders(ctx);
  if (text === labels.settings)   return handleSettings(ctx);

  // «🏠 Главное меню» / «🏠 Bosh menyu» - кнопка возврата (например из
  // экрана запроса геолокации). Восстанавливаем reply-клавиатуру.
  if (text === ctx.t('common.main_menu')) {
    await ctx.reply(ctx.t('buyer.menu.title'), {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(ctx),
    });
    return;
  }

  return next();
}
