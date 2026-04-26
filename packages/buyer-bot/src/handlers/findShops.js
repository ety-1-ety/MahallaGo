import { Keyboard, InlineKeyboard } from 'grammy';
import { callFn, query } from '@mahallashop/shared';
import { shopCard } from '../keyboards/shopCard.js';

const DEFAULT_RADIUS_M = 2000;
const LOCATION_CACHE_MS = 30 * 60 * 1000;  // 30 минут
const RECENT_SHOPS_LIMIT = 5;

/**
 * Запрос геолокации покупателя + быстрый доступ к магазинам, из которых
 * он уже заказывал.
 *
 * Покупатель чаще ходит в одни и те же магазины, поэтому начинаем
 * с inline-списка «ваши магазины». Если ничего нет — обычный location-prompt.
 */
export async function askLocation(ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  // 1) Магазины, из которых покупатель уже заказывал (5 последних).
  const recentShops = ctx.user?.id ? await fetchRecentShops(ctx.user.id) : [];
  if (recentShops.length > 0) {
    const kb = new InlineKeyboard();
    for (const s of recentShops) {
      kb.text(`🏪 ${s.name}`, `shop:open:${s.id}`).row();
    }
    await ctx.reply(
      lang === 'uz'
        ? '🛒 *Avval buyurtma berganingiz doʻkonlar:*'
        : '🛒 *Магазины, где вы уже заказывали:*',
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  }

  // 2) Свежая геолокация в session — короткий путь.
  const last = ctx.session.last_location;
  const fresh = last && last.ts && (Date.now() - last.ts) < LOCATION_CACHE_MS;

  if (fresh) {
    const minsAgo = Math.round((Date.now() - last.ts) / 60000);
    const useLastLabel = lang === 'uz'
      ? `📍 Avvalgi joylashuvni ishlatish (${minsAgo} daqiqa oldin)`
      : `📍 Использовать прошлую геолокацию (${minsAgo} мин назад)`;

    await ctx.reply(t('buyer.find_shops.request_location'), {
      reply_markup: new InlineKeyboard().text(useLastLabel, 'loc:reuse'),
    });
    await ctx.reply(lang === 'uz' ? '...yoki yuboring yangi:' : '...или отправьте новую:', {
      reply_markup: new Keyboard()
        .requestLocation(t('buyer.find_shops.location_button'))
        .row()
        .text(t('common.main_menu'))
        .resized().oneTime(),
    });
    return;
  }

  await ctx.reply(t('buyer.find_shops.request_location'), {
    reply_markup: new Keyboard()
      .requestLocation(t('buyer.find_shops.location_button'))
      .row()
      .text(t('common.main_menu'))
      .resized().oneTime(),
  });
}

async function fetchRecentShops(buyerId) {
  const { rows } = await query(
    `SELECT s.id, s.name, MAX(o.created_at) AS last_at
       FROM orders.orders o
       JOIN shops.shops  s ON s.id = o.shop_id
      WHERE o.buyer_id = $1
        AND s.status = 'active'
      GROUP BY s.id, s.name
      ORDER BY last_at DESC
      LIMIT $2`,
    [buyerId, RECENT_SHOPS_LIMIT],
  );
  return rows;
}

/**
 * Принять геолокацию и показать список магазинов поблизости.
 */
export async function handleLocation(ctx) {
  const loc = ctx.message?.location;
  if (!loc) return;

  ctx.session.last_location = {
    lat: loc.latitude,
    lng: loc.longitude,
    ts: Date.now(),
  };

  await renderNearbyShops(ctx, loc.latitude, loc.longitude);
}

/**
 * Callback «использовать прошлую геолокацию».
 */
export async function handleReuseLocation(ctx) {
  await ctx.answerCallbackQuery();
  const last = ctx.session.last_location;
  if (!last || !last.lat || !last.lng) {
    await ctx.reply(ctx.t('buyer.find_shops.request_location'));
    return askLocation(ctx);
  }
  await renderNearbyShops(ctx, last.lat, last.lng);
}

async function renderNearbyShops(ctx, lat, lng) {
  const shops = await callFn('shops.find_nearby', [lat, lng, DEFAULT_RADIUS_M, 20, 0]);

  const t = ctx.t;
  if (shops.length === 0) {
    await ctx.reply(t('buyer.find_shops.no_shops_nearby'));
    return;
  }

  await ctx.reply(t('buyer.find_shops.found_count', { count: shops.length }), {
    parse_mode: 'Markdown',
  });

  for (const s of shops) {
    const card = shopCard(ctx, s);
    // Photo file_id привязан к боту-загрузчику (seller-bot). Buyer-bot
    // не может отправить тот же file_id — Telegram вернёт ошибку
    // «wrong file identifier». Поэтому пытаемся, но мягко падаем на text.
    let sent = false;
    if (s.photo_file_id) {
      try {
        await ctx.replyWithPhoto(s.photo_file_id, {
          caption: card.text,
          parse_mode: 'Markdown',
          reply_markup: card.keyboard,
        });
        sent = true;
      } catch { /* fallthrough к text-only */ }
    }
    if (!sent) {
      await ctx.reply(card.text, {
        parse_mode: 'Markdown',
        reply_markup: card.keyboard,
      });
    }
  }
}
