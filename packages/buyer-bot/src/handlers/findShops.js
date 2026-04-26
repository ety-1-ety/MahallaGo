import { Keyboard, InlineKeyboard } from 'grammy';
import { callFn } from '@mahallashop/shared';
import { shopCard } from '../keyboards/shopCard.js';

const DEFAULT_RADIUS_M = 2000;
const LOCATION_CACHE_MS = 30 * 60 * 1000;  // 30 минут

/**
 * Запрос геолокации покупателя.
 * Если в session есть свежая (< 30 минут) — предлагаем использовать её.
 */
export async function askLocation(ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

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
