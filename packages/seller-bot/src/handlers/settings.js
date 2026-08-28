import { callFnRow, query } from '@mahallago/shared';
import { settingsKeyboard } from '../keyboards/settings.js';

/**
 * Открыть меню настроек магазина.
 */
export async function handleSettings(ctx) {
  if (!ctx.shop) return;

  await ctx.reply(ctx.t('seller.settings.title'), {
    parse_mode: 'Markdown',
    reply_markup: settingsKeyboard(ctx),
  });
}

/**
 * Обновить настройку магазина после редактирования (вызывается из conversation).
 * Перерисовывает inline-меню с новыми значениями.
 */
export async function refreshShop(ctx) {
  if (!ctx.session?.shop_id) return;
  const { rows } = await query('SELECT * FROM shops.shops WHERE id = $1', [ctx.session.shop_id]);
  ctx.shop = rows[0] || null;
}

/**
 * Применить изменение одной настройки.
 *
 * @param {string} field - min_order | max_order | delivery_fee | free_delivery | radius | hours
 * @param {*} value
 */
export async function applySettingUpdate(ctx, field, value) {
  if (!ctx.shop) return;

  const params = {
    p_shop_id: ctx.shop.id,
    p_min_order_amount:    null,
    p_max_order_amount:    null,
    p_delivery_fee:        null,
    p_free_delivery_from:  null,
    p_delivery_radius_m:   null,
    p_working_hours:       null,
    p_clear_max_order:     false,
    p_clear_free_delivery: false,
  };

  switch (field) {
    case 'min_order':     params.p_min_order_amount   = value; break;
    case 'max_order':
      if (value === null) params.p_clear_max_order = true;
      else                params.p_max_order_amount   = value;
      break;
    case 'delivery_fee':  params.p_delivery_fee       = value; break;
    case 'free_delivery':
      if (value === null) params.p_clear_free_delivery = true;
      else                params.p_free_delivery_from = value;
      break;
    case 'radius':        params.p_delivery_radius_m  = value; break;
    case 'hours':         params.p_working_hours      = value; break;
    default:
      throw new Error(`Unknown setting field: ${field}`);
  }

  await callFnRow('shops.update_settings', [
    params.p_shop_id,
    params.p_min_order_amount,
    params.p_max_order_amount,
    params.p_delivery_fee,
    params.p_free_delivery_from,
    params.p_delivery_radius_m,
    params.p_working_hours,
    params.p_clear_max_order,
    params.p_clear_free_delivery,
  ]);

  await refreshShop(ctx);
}
