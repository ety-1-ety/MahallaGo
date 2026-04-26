import { Keyboard } from 'grammy';
import { callFn } from '@mahallashop/shared';
import { shopCard } from '../keyboards/shopCard.js';

const DEFAULT_RADIUS_M = 2000;

/**
 * Запрос геолокации покупателя.
 */
export async function askLocation(ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  await ctx.reply(t('buyer.find_shops.request_location'), {
    reply_markup: new Keyboard()
      .requestLocation(t('buyer.find_shops.location_button'))
      .row()
      .text(lang === 'uz' ? '↩️ Bosh menyu' : '↩️ Главное меню')
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

  const shops = await callFn('shops.find_nearby', [
    loc.latitude, loc.longitude, DEFAULT_RADIUS_M, 20, 0,
  ]);

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
    if (s.photo_file_id) {
      await ctx.replyWithPhoto(s.photo_file_id, {
        caption: card.text,
        parse_mode: 'Markdown',
        reply_markup: card.keyboard,
      });
    } else {
      await ctx.reply(card.text, {
        parse_mode: 'Markdown',
        reply_markup: card.keyboard,
      });
    }
  }
}
