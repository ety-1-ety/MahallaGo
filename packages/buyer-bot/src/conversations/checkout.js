import { createConversation } from '@grammyjs/conversations';
import { Keyboard, InlineKeyboard } from 'grammy';
import {
  callFnRow,
  query,
  formatUZS,
  DomainError,
  ORDER_ERRORS,
  getRedis,
} from '@mahallashop/shared';

/**
 * Checkout flow:
 *   1. Спросить адрес (текст или геолокация)
 *   2. Спросить заметку (или skip)
 *   3. Подтверждение → orders.create_order
 *   4. При ошибке — локализованное сообщение по коду (все 6 валидаций)
 *   5. При успехе — Redis publish 'orders:new', сообщение покупателю
 */
async function checkoutConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;
  const cart = ctx.session.cart;

  if (!cart || !cart.items || cart.items.length === 0) {
    await ctx.reply(t('buyer.cart.empty'));
    return;
  }

  // ── 1. Адрес ───────────────────────────────────────────────
  await ctx.reply(t('buyer.checkout.ask_address'), {
    reply_markup: new Keyboard()
      .requestLocation(t('buyer.find_shops.location_button'))
      .row()
      .text(t('common.cancel'))
      .resized().oneTime(),
  });

  let lat, lng, addressText;
  while (true) {
    const m = await conversation.wait();
    if (m.message?.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (m.message?.location) {
      lat = m.message.location.latitude;
      lng = m.message.location.longitude;
      // Дополнительно попросим адрес текстом для seller-а
      await ctx.reply(lang === 'uz'
        ? '🏠 Manzilni matn bilan ham kiriting:'
        : '🏠 Введите адрес текстом:');
      const addrMsg = await conversation.waitFor('message:text');
      if (addrMsg.message.text === t('common.cancel')) {
        await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
        return;
      }
      addressText = addrMsg.message.text.trim();
      break;
    }

    if (m.message?.text) {
      // Только текст — используем последнюю известную геолокацию из session
      if (!ctx.session.last_location) {
        await ctx.reply(lang === 'uz'
          ? '❌ Avval joylashuvni yuboring.'
          : '❌ Сначала отправьте геолокацию.');
        continue;
      }
      lat = ctx.session.last_location.lat;
      lng = ctx.session.last_location.lng;
      addressText = m.message.text.trim();
      break;
    }

    await ctx.reply(lang === 'uz'
      ? '❌ Manzilni yuboring.'
      : '❌ Отправьте адрес.');
  }

  // ── 2. Заметка (опционально) ────────────────────────────────
  await ctx.reply(t('buyer.checkout.ask_notes'), {
    reply_markup: new Keyboard().text(t('common.skip')).text(t('common.cancel')).resized().oneTime(),
  });
  let notes = null;
  const noteMsg = await conversation.waitFor('message:text');
  if (noteMsg.message.text === t('common.cancel')) {
    await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
    return;
  }
  if (noteMsg.message.text !== t('common.skip')) {
    notes = noteMsg.message.text.trim();
  }

  // ── 3. Подтверждение ───────────────────────────────────────
  // Получаем магазин и считаем итог для предпросмотра.
  // SELECT через external — между replay'ями состояние магазина может смениться.
  const shop = await conversation.external(async () => {
    const { rows } = await query('SELECT * FROM shops.shops WHERE id = $1', [cart.shop_id]);
    return rows[0] || null;
  });
  if (!shop) {
    await ctx.reply(t('buyer.errors.SHOP_NOT_AVAILABLE'),
      { reply_markup: { remove_keyboard: true } });
    return;
  }

  const subtotal = cart.items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
  let deliveryFee = Number(shop.delivery_fee || 0);
  if (shop.free_delivery_from !== null && subtotal >= Number(shop.free_delivery_from)) {
    deliveryFee = 0;
  }
  const total = subtotal + deliveryFee;

  const summary = [
    `🏪 *${shop.name}*`,
    '',
    ...cart.items.map((i) => `• ${i.name} × ${i.qty}  →  ${formatUZS(i.price * i.qty, lang)}`),
    '─────',
    `${t('buyer.cart.subtotal')}  ${formatUZS(subtotal, lang)}`,
    `${t('buyer.cart.delivery')}  ${formatUZS(deliveryFee, lang)}`,
    `${t('buyer.cart.total')}  ${formatUZS(total, lang)}`,
    '',
    `🏠 ${addressText}`,
    notes ? `✍️ ${notes}` : null,
  ].filter(Boolean).join('\n');

  await ctx.reply(summary + '\n\n' + t('buyer.checkout.confirm_title'), {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard()
      .text(t('buyer.checkout.confirm_button'), 'checkout:confirm')
      .text(t('common.cancel'), 'checkout:cancel'),
  });

  const cb = await conversation.waitForCallbackQuery(/^checkout:/);
  await cb.answerCallbackQuery();
  if (cb.callbackQuery.data === 'checkout:cancel') {
    // Edit через cb (callback-контекст), не ctx — ctx уже устаревший /start.
    try { await cb.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    await ctx.reply(t('common.cancel'), { reply_markup: { remove_keyboard: true } });
    return;
  }

  // ── 4. Создание заказа в БД ────────────────────────────────
  // INSERT через external — replay не должен создать второй заказ.
  // Ошибки тоже фиксируем внутри external, чтобы наружу выехало стабильное значение.
  const itemsJson = cart.items.map((i) => ({ product_id: i.product_id, qty: i.qty }));

  const result = await conversation.external(async () => {
    try {
      const o = await callFnRow('orders.create_order', [
        ctx.user.id,
        cart.shop_id,
        JSON.stringify(itemsJson),
        lat,
        lng,
        addressText,
        notes,
        'cash',
      ]);
      return { ok: true, order: o };
    } catch (err) {
      return {
        ok: false,
        code: err && err.code ? err.code : null,
        name: err && err.name ? err.name : null,
        message: err && err.message ? err.message : String(err),
      };
    }
  });

  if (!result.ok) {
    await handleCreateOrderError(ctx, shop, result);
    try { await cb.editMessageReplyMarkup({ reply_markup: undefined }); } catch {}
    return;
  }
  const order = result.order;

  // ── 5. Успех: pubsub + сообщение покупателю + очистка корзины ──
  ctx.session.cart = { shop_id: null, items: [] };
  ctx.session.current_shop_id = null;

  // Публикуем в Redis pub/sub для seller-bot.
  // external() — replay не должен публиковать дубликат сообщения.
  await conversation.external(async () => {
    try {
      const redis = getRedis();
      const ownerTgId = await getOwnerTelegramId(shop.owner_id);
      const channel = process.env.REDIS_CHANNEL_NEW_ORDER || 'orders:new';
      await redis.publish(channel, JSON.stringify({
        order_id: order.id,
        shop_id: shop.id,
        owner_telegram_id: ownerTgId,
      }));
    } catch (err) {
      // Не критично: продавец увидит заказ при следующем открытии «Заказы»
      // (логируется в errorHandler через bot.catch)
    }
  });

  await ctx.reply(t('buyer.checkout.success', { number: order.number }), {
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true },
  });
}

async function getOwnerTelegramId(ownerUserId) {
  const { rows } = await query('SELECT telegram_id FROM auth.users WHERE id = $1', [ownerUserId]);
  return rows[0]?.telegram_id || null;
}

/**
 * Маппинг ошибок orders.create_order на локализованные сообщения.
 * Поддерживаются ВСЕ 6 валидаций из SPEC.md.
 *
 * Принимает плоский объект с code/name (приходит из conversation.external),
 * либо настоящий Error/DomainError (на случай прямого вызова).
 */
async function handleCreateOrderError(ctx, shop, err) {
  const t = ctx.t;
  const lang = ctx.locale;

  const isDomain = err instanceof DomainError || err?.name === 'DomainError';
  if (!isDomain) {
    await ctx.reply(t('common.error_unknown'));
    return;
  }

  const code = err.code;
  let msg;

  if (code === ORDER_ERRORS.BELOW_MIN_ORDER) {
    msg = t('buyer.errors.BELOW_MIN_ORDER', { min: formatUZS(shop.min_order_amount, lang) });
  } else if (code === ORDER_ERRORS.ABOVE_MAX_ORDER) {
    msg = t('buyer.errors.ABOVE_MAX_ORDER', { max: formatUZS(shop.max_order_amount, lang) });
  } else if (Object.values(ORDER_ERRORS).includes(code)) {
    msg = t(`buyer.errors.${code}`);
  } else {
    msg = t('common.error_unknown');
  }

  await ctx.reply(msg, { reply_markup: { remove_keyboard: true } });
}

export const checkout = createConversation(checkoutConv, 'checkout');
