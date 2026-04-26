import { Keyboard } from 'grammy';

/**
 * Главное меню покупателя (Reply 2x2):
 *
 *   ┌─────────────────────┬─────────────────────┐
 *   │ 📍 Магазины рядом   │ 🛒 Корзина          │
 *   ├─────────────────────┼─────────────────────┤
 *   │ 📦 Мои заказы       │ ⚙️ Настройки        │
 *   └─────────────────────┴─────────────────────┘
 */
export function mainMenuKeyboard(ctx) {
  const t = ctx.t;
  return new Keyboard()
    .text(t('buyer.menu.find_shops')).text(t('buyer.menu.cart')).row()
    .text(t('buyer.menu.my_orders')).text(t('buyer.menu.settings'))
    .resized()
    .persistent();
}

export function mainMenuLabels(ctx) {
  const t = ctx.t;
  return {
    find_shops: t('buyer.menu.find_shops'),
    cart:       t('buyer.menu.cart'),
    my_orders:  t('buyer.menu.my_orders'),
    settings:   t('buyer.menu.settings'),
  };
}
