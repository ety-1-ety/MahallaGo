import { InlineKeyboard } from 'grammy';
import { formatUZS } from '@mahallashop/shared';

/**
 * Inline-меню настроек магазина.
 *
 *   [💰 Мин. сумма заказа: 30 000]
 *   [💎 Макс. сумма заказа: не задана]
 *   [🚚 Доставка: 5 000]
 *   [🆓 Бесплатно от: 100 000]
 *   [📍 Радиус: 500 м]
 *   [🕐 Часы работы]
 *   [← Главное меню]
 */
export function settingsKeyboard(ctx) {
  const shop = ctx.shop;
  const t = ctx.t;
  const lang = ctx.locale;

  const fmt = (v) => formatUZS(v, lang);
  const fmtOrUnset = (v, unsetKey) => v === null || v === undefined
    ? t(unsetKey)
    : fmt(v);

  const langLabel = lang === 'uz' ? 'Oʻzbekcha 🇺🇿' : 'Русский 🇷🇺';

  return new InlineKeyboard()
    .text(t('seller.settings.min_order_label',     { value: fmt(shop.min_order_amount) }),         'set:min_order').row()
    .text(t('seller.settings.max_order_label',     { value: fmtOrUnset(shop.max_order_amount, 'seller.settings.max_order_unset') }),  'set:max_order').row()
    .text(t('seller.settings.delivery_fee_label',  { value: fmt(shop.delivery_fee) }),             'set:delivery_fee').row()
    .text(t('seller.settings.free_delivery_label', { value: fmtOrUnset(shop.free_delivery_from, 'seller.settings.free_delivery_unset') }), 'set:free_delivery').row()
    .text(t('seller.settings.radius_label',        { value: shop.delivery_radius_m }),             'set:radius').row()
    .text(t('seller.settings.hours_label'),                                                        'set:hours').row()
    .text(t('seller.settings.language_label',      { value: langLabel }),                          'set:language').row()
    .text(t('common.back') + ' ' + t('common.main_menu'),                                          'set:back');
}
