/**
 * statusGuard - пропускает действия только если у продавца есть
 * активный одобренный магазин. Используется выборочно на handlers,
 * которые требуют существования магазина (управление товарами, заказами,
 * настройками).
 *
 * Не применяется к /start, выбору языка, онбордингу.
 *
 * Поведение: при блокировке отправляет локализованное уведомление
 * ('shop_not_approved' / 'shop_suspended') и НЕ передаёт управление дальше.
 */
export function statusGuard() {
  return async (ctx, next) => {
    const shop = ctx.shop;

    if (!shop) {
      // Магазина ещё нет - пользователь должен пройти /start → онбординг
      return next();  // не блокируем, /start сам поймает
    }

    if (shop.status === 'pending_approval') {
      await ctx.reply(ctx.t('seller.moderation.pending'), { parse_mode: 'Markdown' });
      return;
    }

    if (shop.status === 'rejected') {
      await ctx.reply(
        ctx.t('seller.moderation.rejected', { reason: shop.rejection_reason || '—' }),
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (shop.status === 'suspended') {
      await ctx.reply(
        ctx.t('seller.moderation.suspended', { reason: shop.rejection_reason || '—' }),
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (shop.status === 'closed') {
      await ctx.reply(ctx.t('seller.errors.shop_not_approved'));
      return;
    }

    // status === 'active' - пускаем
    return next();
  };
}
