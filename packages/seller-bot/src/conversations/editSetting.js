import { createConversation } from '@grammyjs/conversations';
import { Keyboard, InlineKeyboard } from 'grammy';
import { applySettingUpdate } from '../handlers/settings.js';
import { settingsKeyboard } from '../keyboards/settings.js';

/**
 * Универсальный wizard редактирования одной настройки магазина.
 * field хранится в session.editing_setting_field, выставляется callback'ом.
 *
 * Поддерживаемые поля:
 *   min_order, max_order, delivery_fee, free_delivery, radius
 *
 * Поле hours редактируется отдельным wizard'ом — пока упрощённый: только
 * 24/7 ↔ 09:00-22:00 (как в онбординге).
 */
async function editSettingConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;
  const field = ctx.session.editing_setting_field;

  if (!field) {
    await ctx.reply(t('common.error_unknown'));
    return;
  }

  if (field === 'hours') {
    await ctx.reply(t('seller.onboarding.ask_hours'), {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text(lang === 'uz' ? '🕐 24/7' : '🕐 24/7', 'set:hours:24x7').row()
        .text('🕘 09:00 – 22:00', 'set:hours:09x22'),
    });
    const cb = await conversation.waitForCallbackQuery(/^set:hours:/);
    const choice = cb.callbackQuery.data.split(':')[2];
    await cb.answerCallbackQuery();

    let hours = {};
    if (choice === '09x22') {
      const day = { open: '09:00', close: '22:00' };
      hours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
    }
    // UPDATE через external — replay не должен переоткрывать транзакцию.
    await conversation.external(() => applySettingUpdate(ctx, 'hours', JSON.stringify(hours)));
    await ctx.reply(t('seller.settings.saved'));
    delete ctx.session.editing_setting_field;
    await ctx.reply(t('seller.settings.title'), {
      parse_mode: 'Markdown',
      reply_markup: settingsKeyboard(ctx),
    });
    return;
  }

  // Числовые поля
  const cancelBtn = new Keyboard().text(t('common.cancel'));
  let allowClear = false;
  let promptKey;
  switch (field) {
    case 'min_order':
      promptKey = lang === 'uz' ? 'Minimal buyurtma summasini kiriting (soʻm):' : 'Введите минимальную сумму заказа (сум):';
      break;
    case 'max_order':
      promptKey = lang === 'uz' ? 'Maksimal buyurtma summasini kiriting (yoki «Olib tashlash»):' : 'Введите максимальную сумму заказа (или «Сбросить»):';
      cancelBtn.text(lang === 'uz' ? 'Olib tashlash' : 'Сбросить');
      allowClear = true;
      break;
    case 'delivery_fee':
      promptKey = lang === 'uz' ? 'Yetkazib berish narxini kiriting (soʻm):' : 'Введите стоимость доставки (сум):';
      break;
    case 'free_delivery':
      promptKey = lang === 'uz' ? 'Bepul yetkazish chegarasini kiriting (yoki «Olib tashlash»):' : 'Введите сумму бесплатной доставки (или «Сбросить»):';
      cancelBtn.text(lang === 'uz' ? 'Olib tashlash' : 'Сбросить');
      allowClear = true;
      break;
    case 'radius':
      promptKey = lang === 'uz' ? 'Yetkazib berish radiusini kiriting (m, 50–10000):' : 'Введите радиус доставки в метрах (50–10000):';
      break;
    default:
      await ctx.reply(t('common.error_unknown'));
      return;
  }

  await ctx.reply(promptKey, { reply_markup: cancelBtn.resized().oneTime() });

  let value = null;
  while (value === null) {
    const m = await conversation.waitFor('message:text');
    const txt = m.message.text.trim();

    if (txt === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      delete ctx.session.editing_setting_field;
      return;
    }

    if (allowClear && (txt === 'Сбросить' || txt === 'Olib tashlash')) {
      value = 'CLEAR';
      break;
    }

    const cleaned = txt.replace(/\s+/g, '').replace(',', '.');
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      await ctx.reply(lang === 'uz' ? '❌ Notoʻgʻri qiymat.' : '❌ Неверное значение.');
      continue;
    }

    if (field === 'radius') {
      if (!Number.isInteger(n) || n < 50 || n > 10000) {
        await ctx.reply(lang === 'uz' ? '❌ 50–10000 oraligʻida butun son.' : '❌ Целое число 50–10000.');
        continue;
      }
    }

    value = field === 'radius' ? Math.round(n) : Math.round(n * 100) / 100;
  }

  // UPDATE через external — replay не должен переоткрывать транзакцию.
  const finalValue = value === 'CLEAR' ? null : value;
  await conversation.external(() => applySettingUpdate(ctx, field, finalValue));
  await ctx.reply(t('seller.settings.saved'), { reply_markup: { remove_keyboard: true } });

  delete ctx.session.editing_setting_field;
  await ctx.reply(t('seller.settings.title'), {
    parse_mode: 'Markdown',
    reply_markup: settingsKeyboard(ctx),
  });
}

export const editSetting = createConversation(editSettingConv, 'editSetting');
