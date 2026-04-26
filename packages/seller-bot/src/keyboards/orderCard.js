import { InlineKeyboard } from 'grammy';

/**
 * Inline-кнопки для карточки заказа в seller-bot.
 * Меняются по статусу:
 *   pending    → [✅ Принять]   [❌ Отклонить]
 *   accepted   → [📦 Готов к выдаче]
 *   ready      → [🚚 Передан курьеру]
 *   delivering → [✅ Доставлен]
 *   completed  → нет кнопок (финал)
 */
export function orderCardKeyboard(ctx, order) {
  const kb = new InlineKeyboard();
  const t = ctx.t;

  switch (order.status) {
    case 'pending':
      kb.text(t('seller.new_order_notif.accept'), `order:accept:${order.id}`)
        .text(t('seller.new_order_notif.reject'), `order:reject:${order.id}`);
      break;
    case 'accepted':
      kb.text('📦 ' + (ctx.locale === 'uz' ? 'Tayyor' : 'Готов к выдаче'),
              `order:ready:${order.id}`);
      break;
    case 'ready':
      kb.text('🚚 ' + (ctx.locale === 'uz' ? 'Yetkazilmoqda' : 'Передан курьеру'),
              `order:delivering:${order.id}`);
      break;
    case 'delivering':
      kb.text('✅ ' + (ctx.locale === 'uz' ? 'Yetkazildi' : 'Доставлен'),
              `order:completed:${order.id}`);
      break;
    default:
      // completed / rejected / cancelled — без кнопок
      return null;
  }

  return kb;
}
