import { callFnRow } from '@mahallago/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * Переключить флаг is_accepting_orders. Срабатывает на reply-кнопки
 * "🟢 Принимаю заказы" / "🔴 Не принимаю заказы".
 */
export async function handleToggleAccepting(ctx) {
  if (!ctx.shop) return;

  const newValue = !ctx.shop.is_accepting_orders;

  const updated = await callFnRow('shops.toggle_accepting_orders', [
    ctx.shop.id, newValue,
  ]);

  ctx.shop = updated;

  const msg = newValue
    ? (ctx.locale === 'uz' ? '🟢 Buyurtmalarni qabul qilyapsiz' : '🟢 Принимаете заказы')
    : (ctx.locale === 'uz' ? '🔴 Buyurtmalar qabul qilinmayapti' : '🔴 Заказы не принимаются');

  await ctx.reply(msg, { reply_markup: mainMenuKeyboard(ctx) });
}
