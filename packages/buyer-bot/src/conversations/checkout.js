import { createConversation } from '@grammyjs/conversations';
import { Keyboard, InlineKeyboard } from 'grammy';
import {
  callFnRow,
  query,
  formatUZS,
  DomainError,
  ORDER_ERRORS,
  getRedis,
  normalizePhone,
} from '@mahallashop/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

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

  // ── 0. Телефон (только если ещё не сохранён) ───────────────
  // Продавцу нужно как-то связаться с покупателем — собираем номер
  // один раз при первом checkout и сохраняем в auth.users.phone.
  // На последующих заказах этот шаг скипается.
  if (!ctx.user?.phone) {
    await ctx.reply(t('buyer.checkout.ask_phone'), {
      reply_markup: new Keyboard()
        .requestContact(t('buyer.checkout.phone_button'))
        .row()
        .text(t('common.cancel'))
        .resized().oneTime(),
    });
    let phone = null;
    while (phone === null) {
      const m = await conversation.wait();
      if (m.message?.text === t('common.cancel')) {
        await ctx.reply(t('common.cancel'), { reply_markup: mainMenuKeyboard(ctx) });
        return;
      }
      if (m.message?.contact?.phone_number) {
        phone = normalizePhone(m.message.contact.phone_number);
        if (phone) break;
      }
      if (m.message?.text) {
        const candidate = normalizePhone(m.message.text);
        if (candidate && /^\+\d{9,15}$/.test(candidate)) {
          phone = candidate;
          break;
        }
      }
      phone = null;
      await ctx.reply(t('buyer.checkout.phone_invalid'));
    }

    // UPDATE через external — replay не должен повторно дёрнуть БД.
    await conversation.external(() => query(
      'UPDATE auth.users SET phone = $1, updated_at = NOW() WHERE id = $2',
      [phone, ctx.user.id],
    ));
    // Локально отразим обновление, чтобы дальше в conversation
    // ctx.user.phone был уже заполнен (не критично, но чище).
    ctx.user.phone = phone;
    await ctx.reply(t('buyer.checkout.phone_saved'));
  }

  // ── 1. Адрес ───────────────────────────────────────────────
  // Если у покупателя есть прошлые заказы — предлагаем выбрать один
  // из 3 недавних адресов (inline-кнопками). Параллельно — обычный
  // запрос геолокации/текста для нового адреса.
  const recentAddrs = await conversation.external(async () => {
    const { rows } = await query(
      `SELECT delivery_address,
              ST_Y(delivery_location::GEOMETRY) AS lat,
              ST_X(delivery_location::GEOMETRY) AS lng
         FROM orders.orders
        WHERE buyer_id = $1
          AND delivery_address IS NOT NULL
        GROUP BY delivery_address, delivery_location
        ORDER BY MAX(created_at) DESC
        LIMIT 3`,
      [ctx.user.id],
    );
    return rows;
  });

  if (recentAddrs.length > 0) {
    const kb = new InlineKeyboard();
    for (let i = 0; i < recentAddrs.length; i++) {
      const a = recentAddrs[i];
      const label = a.delivery_address.length > 40
        ? a.delivery_address.slice(0, 39) + '…'
        : a.delivery_address;
      kb.text(`📍 ${label}`, `addr:reuse:${i}`).row();
    }
    await ctx.reply(
      lang === 'uz'
        ? '🏠 Avvalgi manzilni tanlang yoki yangi yuboring:'
        : '🏠 Выберите прошлый адрес или отправьте новый:',
      { reply_markup: kb },
    );
  }

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

    // Inline-кнопка «использовать прошлый адрес»
    if (m.callbackQuery?.data?.startsWith('addr:reuse:')) {
      const idx = Number(m.callbackQuery.data.split(':')[2]);
      const chosen = recentAddrs[idx];
      await m.answerCallbackQuery();
      if (!chosen) {
        await ctx.reply(t('common.error_unknown'));
        continue;
      }
      lat = Number(chosen.lat);
      lng = Number(chosen.lng);
      addressText = chosen.delivery_address;
      break;
    }

    if (m.message?.text === t('common.cancel')) {
      await ctx.reply(t('common.cancel'), { reply_markup: mainMenuKeyboard(ctx) });
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
        await ctx.reply(t('common.cancel'), { reply_markup: mainMenuKeyboard(ctx) });
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
    await ctx.reply(t('common.cancel'), { reply_markup: mainMenuKeyboard(ctx) });
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
      { reply_markup: mainMenuKeyboard(ctx) });
    return;
  }

  // ── Pre-checkout валидация cart-items ──────────────────────
  // Корзина в Redis может содержать продукты, которые продавец удалил/скрыл
  // или у которых не хватает stock. Проверяем НА СТАРТЕ checkout, чтобы не
  // дать пользователю увидеть старый summary и не упасть с ITEM_NOT_AVAILABLE
  // в SQL. Если что-то изменилось — поправляем cart и выходим, пользователь
  // увидит реальное состояние при следующем нажатии «Оформить».
  const validation = await conversation.external(async () => {
    const ids = cart.items.map((i) => i.product_id);
    const { rows } = await query(
      'SELECT id, name, is_active, stock, price FROM catalog.products WHERE id = ANY($1::uuid[])',
      [ids],
    );
    return rows;
  });
  const byId = new Map(validation.map((r) => [r.id, r]));
  const removed = [];
  const adjusted = [];
  const newItems = [];
  for (const item of cart.items) {
    const p = byId.get(item.product_id);
    if (!p || !p.is_active) {
      removed.push(item.name);
      continue;
    }
    if (Number(p.stock) <= 0) {
      removed.push(item.name);
      continue;
    }
    if (Number(p.stock) < Number(item.qty)) {
      adjusted.push({ name: item.name, available: Number(p.stock) });
      newItems.push({ ...item, qty: Number(p.stock), price: Number(p.price) });
      continue;
    }
    newItems.push({ ...item, price: Number(p.price) });
  }

  if (removed.length > 0 || adjusted.length > 0) {
    // Сохраняем поправленный cart через session — мутация ctx.session не
    // персистится в conversations 1.x, нужно через текущий wait-ctx или
    // через external().
    await conversation.external(async () => {
      // sessionMiddleware уже сохранил session при входе; нам нужно ОБНОВИТЬ
      // запись. Пишем напрямую в Redis под тем же ключом.
      const { getRedis } = await import('@mahallashop/shared');
      const redis = getRedis();
      const prefix = process.env.REDIS_PREFIX || 'buyer:';
      const key = `${prefix}sess:${ctx.from.id}`;
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.cart = parsed.cart || {};
        parsed.cart.items = newItems;
        if (newItems.length === 0) {
          parsed.cart.shop_id = null;
        }
        await redis.set(key, JSON.stringify(parsed), 'EX', 60 * 60 * 24 * 30);
      }
    });

    if (removed.length > 0) {
      await ctx.reply(t('buyer.checkout.items_removed', { names: removed.join(', ') }),
        { reply_markup: mainMenuKeyboard(ctx) });
    }
    if (adjusted.length > 0) {
      const summary = adjusted.map((a) => `${a.name} → ${a.available}`).join(', ');
      await ctx.reply(t('buyer.checkout.items_adjusted', { summary }));
    }
    if (newItems.length === 0) {
      await ctx.reply(t('buyer.checkout.cart_now_empty'),
        { reply_markup: mainMenuKeyboard(ctx) });
    }
    return;
  }

  // На этом шаге cart прошёл валидацию — можно обновить локальную копию
  // (для расчёта summary) актуальными ценами из БД.
  cart.items = newItems;
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
    await ctx.reply(t('common.cancel'), { reply_markup: mainMenuKeyboard(ctx) });
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
  // Мутируем cb.session — мутации ctx.session не персистятся в conversations 1.x.
  cb.session.cart = { shop_id: null, items: [] };
  cb.session.current_shop_id = null;
  // Сброс id «sticky» reminder'а корзины — следующий цикл «добавил → reminder»
  // должен начаться с чистого сообщения.
  delete cb.session.cart_reminder_msg_id;

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

  await cb.reply(t('buyer.checkout.success', { number: order.number }), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard(ctx),
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

  await ctx.reply(msg, { reply_markup: mainMenuKeyboard(ctx) });
}

export const checkout = createConversation(checkoutConv, 'checkout');
