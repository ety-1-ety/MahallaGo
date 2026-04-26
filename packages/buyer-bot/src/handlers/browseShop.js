import { callFn, query } from '@mahallashop/shared';
import { categoriesInline, productCard } from '../keyboards/productCard.js';

/**
 * Открыть магазин: показать список категорий с количеством товаров.
 */
export async function handleOpenShop(ctx, shopId) {
  const cats = await callFn('catalog.list_categories_with_counts', [shopId]);
  const lang = ctx.locale;

  if (cats.length === 0) {
    await ctx.reply(lang === 'uz'
      ? '📦 Bu doʻkonda hozircha mahsulotlar yoʻq.'
      : '📦 В этом магазине пока нет товаров.');
    return;
  }

  // Сохраним текущий магазин в session для продолжения flow
  ctx.session.current_shop_id = shopId;

  await ctx.reply(lang === 'uz' ? '📂 *Toifani tanlang:*' : '📂 *Выберите категорию:*', {
    parse_mode: 'Markdown',
    reply_markup: categoriesInline(ctx, cats),
  });
}

/**
 * Показать товары в выбранной категории.
 */
export async function handleCategory(ctx, categoryId) {
  const shopId = ctx.session.current_shop_id;
  if (!shopId) {
    await ctx.reply(ctx.t('common.error_unknown'));
    return;
  }

  const products = await callFn('catalog.list_by_category', [shopId, categoryId, 1, 20]);

  if (products.length === 0) {
    await ctx.reply(ctx.locale === 'uz'
      ? '📦 Bu toifada mahsulotlar yoʻq.'
      : '📦 В этой категории нет товаров.');
    return;
  }

  for (const p of products) {
    const currentQty = getCartQty(ctx, p.id);
    const card = productCard(ctx, p, currentQty);
    if (p.photo_file_id) {
      await ctx.replyWithPhoto(p.photo_file_id, {
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

function getCartQty(ctx, productId) {
  const cart = ctx.session.cart;
  if (!cart || !cart.items) return 0;
  return cart.items.find((i) => i.product_id === productId)?.qty || 0;
}

/**
 * Обработка callback'ов prod:inc / prod:dec / prod:add.
 * Корзина может содержать товары только одного магазина — если пользователь
 * пытается добавить из другого, показываем подтверждение.
 */
export async function handleProductCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [, action, productId] = data.split(':');
  if (!productId || action === 'noop') {
    await ctx.answerCallbackQuery();
    return;
  }

  // Загружаем product
  const { rows } = await query(
    'SELECT id, shop_id, name, price, stock FROM catalog.products WHERE id = $1 AND is_active = TRUE',
    [productId],
  );
  const p = rows[0];
  if (!p) {
    await ctx.answerCallbackQuery(ctx.locale === 'uz' ? 'Topilmadi' : 'Не найдено');
    return;
  }

  if (p.stock === 0) {
    await ctx.answerCallbackQuery(ctx.t('buyer.errors.ITEM_OUT_OF_STOCK'));
    return;
  }

  // Проверка единого магазина в корзине
  const cart = ctx.session.cart || { shop_id: null, items: [] };
  if (cart.shop_id && cart.shop_id !== p.shop_id && cart.items.length > 0) {
    // Сбрасываем корзину при добавлении товара из другого магазина
    cart.shop_id = p.shop_id;
    cart.items = [];
  }
  if (!cart.shop_id) cart.shop_id = p.shop_id;

  let item = cart.items.find((i) => i.product_id === productId);
  if (action === 'inc' || action === 'add') {
    if (!item) {
      item = { product_id: productId, name: p.name, price: Number(p.price), qty: 0 };
      cart.items.push(item);
    }
    if (item.qty < p.stock) item.qty += 1;
  } else if (action === 'dec') {
    if (item) {
      item.qty -= 1;
      if (item.qty <= 0) {
        cart.items = cart.items.filter((i) => i.product_id !== productId);
      }
    }
  }

  ctx.session.cart = cart;

  // Обновим клавиатуру inline-карточки
  const newQty = item ? item.qty : 0;
  const newCard = productCard(ctx, p, newQty);
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: newCard.keyboard });
  } catch { /* сообщение могло быть слишком старым */ }

  await ctx.answerCallbackQuery(
    action === 'add' || action === 'inc'
      ? (ctx.locale === 'uz' ? '✓ Qoʻshildi' : '✓ Добавлено')
      : (ctx.locale === 'uz' ? '✓ Olib tashlandi' : '✓ Удалено'),
  );
}
