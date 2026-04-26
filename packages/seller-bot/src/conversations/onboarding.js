import { createConversation } from '@grammyjs/conversations';
import { Keyboard, InlineKeyboard } from 'grammy';
import { callFnRow, query } from '@mahallashop/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * 6-шаговый онбординг магазина.
 *
 *   1/6  Название
 *   2/6  Категория (выбор из catalog.categories)
 *   3/6  Геолокация магазина
 *   4/6  Контактный телефон
 *   5/6  Фото (или skip)
 *   6/6  Часы работы (24/7 или вручную) — для MVP только 24/7 или 09:00-22:00
 *
 * По завершении: shops.register → status=pending_approval, уведомление пользователю.
 */
const TOTAL_STEPS = 6;

function stepHeader(ctx, step) {
  return ctx.t('seller.onboarding.step_format', { step, total: TOTAL_STEPS });
}

async function fetchCategories() {
  const { rows } = await query(
    'SELECT id, slug, name_uz, name_ru, emoji FROM catalog.categories WHERE is_active = TRUE ORDER BY sort_order ASC',
  );
  return rows;
}

function categoryLabel(cat, locale) {
  const name = locale === 'uz' ? cat.name_uz : cat.name_ru;
  return `${cat.emoji || '📦'} ${name}`;
}

async function onboardingConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  // ── 1/6 Название ───────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 1)}\n${t('seller.onboarding.ask_name')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.cancel')).resized().oneTime(),
  });
  let nameMsg;
  while (true) {
    nameMsg = await conversation.waitFor('message:text');
    if (nameMsg.message.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }
    if (nameMsg.message.text.trim().length >= 2) break;
    await ctx.reply(lang === 'uz' ? '❌ Nom juda qisqa.' : '❌ Слишком короткое название.');
  }
  const shopName = nameMsg.message.text.trim();

  // ── 2/6 Категория ──────────────────────────────────────────
  // Чтения БД из conversations должны идти через conversation.external(),
  // иначе при replay результат будет перевыполняться и может расходиться.
  const cats = await conversation.external(() => fetchCategories());
  const catKb = new InlineKeyboard();
  for (const c of cats) {
    catKb.text(categoryLabel(c, lang), `onb:cat:${c.slug}`).row();
  }
  await ctx.reply(`${stepHeader(ctx, 2)}\n${t('seller.onboarding.ask_category')}`, {
    parse_mode: 'Markdown',
    reply_markup: catKb,
  });
  const catCb = await conversation.waitForCallbackQuery(/^onb:cat:/);
  const catSlug = catCb.callbackQuery.data.split(':')[2];
  const chosenCat = cats.find((c) => c.slug === catSlug);
  await catCb.answerCallbackQuery();
  await ctx.api.editMessageReplyMarkup(catCb.chat.id, catCb.callbackQuery.message.message_id, {
    reply_markup: new InlineKeyboard().text(`✓ ${categoryLabel(chosenCat, lang)}`, 'noop'),
  });

  // ── 3/6 Геолокация ─────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 3)}\n${t('seller.onboarding.ask_address')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard()
      .requestLocation(lang === 'uz' ? '📍 Joylashuvni yuborish' : '📍 Отправить геолокацию')
      .row()
      .text(t('common.cancel'))
      .resized().oneTime(),
  });
  let locationMsg;
  while (true) {
    locationMsg = await conversation.wait();
    if (locationMsg.message?.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }
    if (locationMsg.message?.location) break;
    await ctx.reply(lang === 'uz'
      ? '❌ Iltimos, joylashuvni yuboring (📎 → Location).'
      : '❌ Пожалуйста, отправьте геолокацию (📎 → Геопозиция).');
  }
  const lat = locationMsg.message.location.latitude;
  const lng = locationMsg.message.location.longitude;

  // Адрес текстом (опционально). Кнопка отмены обязательна — иначе
  // пользователь, написавший «Отмена», получит «Отмена» в качестве адреса.
  await ctx.reply(
    lang === 'uz'
      ? '🏠 Manzilni matn bilan yuboring (masalan: Yangi koʻcha 12)'
      : '🏠 Отправьте адрес текстом (например: ул. Новая, 12)',
    {
      reply_markup: new Keyboard().text(t('common.cancel')).resized().oneTime(),
    },
  );
  let address;
  while (true) {
    const addrMsg = await conversation.waitFor('message:text');
    if (addrMsg.message.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }
    const trimmed = addrMsg.message.text.trim();
    if (trimmed.length >= 3) {
      address = trimmed;
      break;
    }
    await ctx.reply(lang === 'uz'
      ? '❌ Manzil juda qisqa.'
      : '❌ Слишком короткий адрес.');
  }

  // ── 4/6 Телефон ────────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 4)}\n${t('seller.onboarding.ask_phone')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard()
      .requestContact(lang === 'uz' ? '📞 Raqamni ulashish' : '📞 Поделиться номером')
      .row()
      .text(t('common.cancel'))
      .resized().oneTime(),
  });
  let phoneMsg, phone;
  while (true) {
    phoneMsg = await conversation.wait();
    if (phoneMsg.message?.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }
    if (phoneMsg.message?.contact?.phone_number) {
      phone = phoneMsg.message.contact.phone_number;
      break;
    }
    if (phoneMsg.message?.text && /^\+?\d{9,15}$/.test(phoneMsg.message.text.trim())) {
      phone = phoneMsg.message.text.trim();
      break;
    }
    await ctx.reply(lang === 'uz'
      ? '❌ Telefon raqamini yuboring (kontakt yoki +998901234567).'
      : '❌ Отправьте номер телефона (контактом или +998901234567).');
  }

  // ── 5/6 Фото (skip разрешён) ───────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 5)}\n${t('seller.onboarding.ask_photo')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.skip')).text(t('common.cancel')).resized().oneTime(),
  });
  let photoFileId = null;
  while (true) {
    const photoMsg = await conversation.wait();
    if (photoMsg.message?.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }
    if (photoMsg.message?.text === t('common.skip')) {
      break;
    }
    if (photoMsg.message?.photo?.length > 0) {
      // Берём максимально большое фото (последний элемент)
      photoFileId = photoMsg.message.photo[photoMsg.message.photo.length - 1].file_id;
      break;
    }
    // Стикер, документ, гифка, голосовое — не подходят. Просим ещё раз.
    await ctx.reply(lang === 'uz'
      ? '❌ Iltimos, suratni yuboring yoki «Oʻtkazib yuborish».'
      : '❌ Пришлите фото или нажмите «Пропустить».');
  }

  // ── 6/6 Часы работы ────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 6)}\n${t('seller.onboarding.ask_hours')}`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard()
      .text(lang === 'uz' ? '🕐 24/7 — har doim ochiq' : '🕐 24/7 — всегда открыт', 'onb:hours:24x7').row()
      .text(lang === 'uz' ? '🕘 09:00 – 22:00' : '🕘 09:00 – 22:00', 'onb:hours:09x22'),
  });
  const hoursCb = await conversation.waitForCallbackQuery(/^onb:hours:/);
  const choice = hoursCb.callbackQuery.data.split(':')[2];
  await hoursCb.answerCallbackQuery();

  let workingHours = {};
  if (choice === '09x22') {
    const day = { open: '09:00', close: '22:00' };
    workingHours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
  }
  // 24x7 → пустой объект = всегда открыт

  // ── Регистрация в БД ───────────────────────────────────────
  // INSERT обязательно через external — иначе при replay создастся дубликат магазина.
  const shop = await conversation.external(() => callFnRow('shops.register', [
    ctx.user.id,
    shopName,
    catSlug,
    null,                  // description
    photoFileId,
    phone,
    address,
    lat,
    lng,
    JSON.stringify(workingHours),
    'Asia/Tashkent',
  ]));

  // Мутируем сессию через hoursCb — последний wait-ctx, его session
  // персистится. ctx.session не сохранится в conversations 1.x.
  hoursCb.session.shop_id = shop.id;

  await hoursCb.reply(t('seller.onboarding.submitted'), {
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true },
  });
}

export const onboarding = createConversation(onboardingConv, 'onboarding');
