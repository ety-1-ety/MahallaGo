import { Keyboard } from 'grammy';

/**
 * Главное меню продавца (reply keyboard 2x3).
 *
 *   ┌-┬-┐
 *   │ 🟢 Принимаю заказы  │ 🛒 Заказы           │
 *   ├-┼-┤
 *   │ 📦 Мои товары       │ ➕ Добавить товар   │
 *   ├-┼-┤
 *   │ 📊 Статистика       │ ⚙️ Настройки        │
 *   └-┴-┘
 */
export function mainMenuKeyboard(ctx) {
  const t = ctx.t;
  const accepting = ctx.shop?.is_accepting_orders === true;
  const acceptingLabel = accepting
    ? t('seller.menu.accepting_on')
    : t('seller.menu.accepting_off');

  return new Keyboard()
    .text(acceptingLabel).text(t('seller.menu.orders')).row()
    .text(t('seller.menu.products')).text(t('seller.menu.add_product')).row()
    .text(t('seller.menu.stats')).text(t('seller.menu.settings'))
    .resized()
    .persistent();
}

/**
 * Возвращает «карту» текстов главного меню для матчинга входящего сообщения.
 * Используется в menu router.
 */
export function mainMenuLabels(ctx) {
  const t = ctx.t;
  return {
    accepting_on:  t('seller.menu.accepting_on'),
    accepting_off: t('seller.menu.accepting_off'),
    orders:        t('seller.menu.orders'),
    products:      t('seller.menu.products'),
    add_product:   t('seller.menu.add_product'),
    stats:         t('seller.menu.stats'),
    settings:      t('seller.menu.settings'),
  };
}
