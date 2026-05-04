import { createConversation } from '@grammyjs/conversations';
import { Keyboard, InlineKeyboard } from 'grammy';
import { callFnRow, query, formatUZS, downloadTelegramPhoto } from '@mahallashop/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * 5-шаговый wizard добавления товара.
 *
 *   1/5  Название
 *   2/5  Категория (выбор из catalog.categories)
 *   3/5  Цена (число)
 *   4/5  Остаток (число)
 *   5/5  Фото (или skip)
 */
const TOTAL_STEPS = 5;

function stepHeader(ctx, step) {
  return ctx.t('seller.onboarding.step_format', { step, total: TOTAL_STEPS });
}

async function fetchCategories() {
  const { rows } = await query(
    'SELECT id, slug, name_uz, name_ru, emoji FROM catalog.categories WHERE is_active = TRUE ORDER BY sort_order ASC',
  );
  return rows;
}

async function addProductConv(conversation, ctx) {
  const t = ctx.t;
  const lang = ctx.locale;

  if (!ctx.shop) {
    await ctx.reply(t('seller.errors.shop_not_approved'));
    return;
  }

  // ── 1/5 Название ───────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 1)}\n${t('seller.products.add_step_name')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.cancel')).resized().oneTime(),
  });
  let nameMsg;
  while (true) {
    nameMsg = await conversation.waitFor('message:text');
    if (nameMsg.message.text === t('common.cancel')) {
      await ctx.reply(t('common.cancelled'), { reply_markup: mainMenuKeyboard(ctx) });
      return;
    }
    if (nameMsg.message.text.trim().length >= 2) break;
    await ctx.reply(lang === 'uz' ? '❌ Nom juda qisqa.' : '❌ Слишком короткое название.');
  }
  const name = nameMsg.message.text.trim();

  // ── 2/5 Категория ──────────────────────────────────────────
  // Чтения БД через conversation.external(), чтобы не было повторного запроса
  // при replay (категории могут смениться между прогонами).
  const cats = await conversation.external(() => fetchCategories());
  const catKb = new InlineKeyboard();
  cats.forEach((c, i) => {
    catKb.text(`${c.emoji || '📦'} ${lang === 'uz' ? c.name_uz : c.name_ru}`, `addp:cat:${c.id}`);
    if (i % 2 === 1) catKb.row();
  });
  if (cats.length % 2 === 1) catKb.row();
  catKb.text(lang === 'uz' ? '⏭ Toifasiz' : '⏭ Без категории', 'addp:cat:none');
  await ctx.reply(`${stepHeader(ctx, 2)}\n${t('seller.products.add_step_category')}`, {
    parse_mode: 'Markdown',
    reply_markup: catKb,
  });
  const catCb = await conversation.waitForCallbackQuery(/^addp:cat:/);
  const catVal = catCb.callbackQuery.data.split(':')[2];
  const categoryId = catVal === 'none' ? null : catVal;
  await catCb.answerCallbackQuery();

  // ── 3/5 Цена ───────────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 3)}\n${t('seller.products.add_step_price')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.cancel')).resized().oneTime(),
  });
  let price = null;
  while (price === null) {
    const m = await conversation.waitFor('message:text');
    if (m.message.text === t('common.cancel')) {
      await ctx.reply(t('common.cancelled'), { reply_markup: mainMenuKeyboard(ctx) });
      return;
    }
    const cleaned = m.message.text.replace(/\s+/g, '').replace(',', '.');
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 0 && n < 1e10) {
      price = Math.round(n * 100) / 100;
    } else {
      await ctx.reply(lang === 'uz' ? '❌ Notoʻgʻri narx. Faqat raqam.' : '❌ Неверная цена. Только число.');
    }
  }

  // ── 4/5 Остаток ────────────────────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 4)}\n${t('seller.products.add_step_stock')}`);
  let stock = null;
  while (stock === null) {
    const m = await conversation.waitFor('message:text');
    if (m.message.text === t('common.cancel')) {
      await ctx.reply(t('common.cancelled'), { reply_markup: mainMenuKeyboard(ctx) });
      return;
    }
    const n = Number(m.message.text.trim());
    if (Number.isInteger(n) && n >= 0 && n < 1e7) {
      stock = n;
    } else {
      await ctx.reply(lang === 'uz' ? '❌ Notoʻgʻri miqdor. Butun son.' : '❌ Неверное число. Целое.');
    }
  }

  // ── 5/5 Фото (skip разрешён) ───────────────────────────────
  await ctx.reply(`${stepHeader(ctx, 5)}\n${t('seller.products.add_step_photo')}`, {
    parse_mode: 'Markdown',
    reply_markup: new Keyboard().text(t('common.skip')).text(t('common.cancel')).resized().oneTime(),
  });
  let photoFileId = null;
  let lastCtx = ctx;
  while (true) {
    const photoMsg = await conversation.wait();
    lastCtx = photoMsg;
    if (photoMsg.message?.text === t('common.cancel')) {
      await photoMsg.reply(t('common.cancelled'), {
        reply_markup: mainMenuKeyboard(ctx),
      });
      return;
    }
    if (photoMsg.message?.text === t('common.skip')) {
      break;
    }
    if (photoMsg.message?.photo?.length > 0) {
      photoFileId = photoMsg.message.photo[photoMsg.message.photo.length - 1].file_id;
      break;
    }
    await photoMsg.reply(lang === 'uz'
      ? '❌ Iltimos, mahsulot suratini yuboring yoki «Oʻtkazib yuborish».'
      : '❌ Пришлите фото товара или нажмите «Пропустить».');
  }

  // ── Создание ───────────────────────────────────────────────
  // INSERT через external — replay не должен создать второй товар.
  // Уникальный индекс uniq_products_shop_name_active отвергает повторное
  // имя в том же активном магазине; ловим SQLSTATE 23505 (unique_violation)
  // и показываем дружелюбное сообщение пользователю.
  const result = await conversation.external(async () => {
    try {
      const p = await callFnRow('catalog.add_product', [
        ctx.shop.id, categoryId, name, null, photoFileId, price, stock,
      ]);
      return { ok: true, product: p };
    } catch (err) {
      // pg ошибки сериализуем в плоский объект (DomainError instances не
      // переживают границу external() в grammY conversations).
      return {
        ok: false,
        code: err && err.code ? err.code : null,
        constraint: err && err.constraint ? err.constraint : null,
        detail: err && err.detail ? err.detail : null,
        message: err && err.message ? err.message : String(err),
      };
    }
  });

  if (!result.ok) {
    if (result.code === '23505') {
      await lastCtx.reply(t('seller.products.duplicate_name', { name }), {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(ctx),
      });
    } else {
      await lastCtx.reply(t('common.error_unknown'), {
        reply_markup: mainMenuKeyboard(ctx),
      });
    }
    return;
  }

  const product = result.product;

  // Если есть фото — скачиваем байты в общее хранилище data/photos/
  // (anchor'ится к project root, не CWD), чтобы buyer-bot тоже мог
  // отобразить. Telegram file_id привязан к загрузчику и не работает
  // в другом боте, поэтому без байтов на диске у покупателя фото не появится.
  if (photoFileId) {
    try {
      const photoPath = await conversation.external(() => downloadTelegramPhoto({
        token: process.env.BOT_TOKEN,
        fileId: photoFileId,
      }));
      await conversation.external(() => query(
        'UPDATE catalog.products SET photo_path = $1 WHERE id = $2',
        [photoPath, product.id],
      ));
    } catch (err) {
      // Не критично для создания товара (он уже в БД), но хотим видеть
      // реальные сбои (network / 401 / disk full) в логах.
      // eslint-disable-next-line no-console
      console.warn('downloadTelegramPhoto failed:', err && err.message ? err.message : err);
    }
  }

  // Возвращаем главное меню, чтобы пользователь мог сразу добавить
  // ещё один товар или перейти в другой раздел.
  await lastCtx.reply(t('seller.products.added', { name: product.name, price: formatUZS(product.price, lang) }), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard(ctx),
  });
}

export const addProduct = createConversation(addProductConv, 'addProduct');
