// «Мои товары» - навигация по товарам магазина в seller-bot.
//
// Архитектура (v2):
//   Stage 1 - Categories view: список категорий (2 колонки) с count'ами.
//   Stage 2 - List view:       пагинируемый список товаров внутри категории
//                               (или «все», или «без категории», или поиск).
//   Stage 3 - Search:           отдельный conversation 'productSearch'
//                               (см. conversations/productSearch.js).
//   Stage 4 - Card view:        карточка одного товара с фото и кнопками
//                               управления (price/stock/toggle/delete).
//
// Состояние страницы хранится в Redis по {chat_id, message_id} - см.
// myProductsState.js. В callback_data передаём только action; полное
// состояние (категория, страница, поиск) подтягивается из Redis.

import { query, callFnRow, formatUZS } from '@mahallago/shared';
import { InlineKeyboard } from 'grammy';
import { loadState, saveState, clearState } from './myProductsState.js';

const PER_PAGE = 8;

// - Точка входа из reply-кнопки «📦 Мои товары» -
export async function handleMyProducts(ctx) {
  if (!ctx.shop) return;
  await renderCategoriesView(ctx, { send: true });
}

// - Главный роутер callback'ов mp:* -
export async function handleMyProductsCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('mp:')) return;
  if (!ctx.shop) {
    await ctx.answerCallbackQuery();
    return;
  }

  const parts     = data.split(':');
  const action    = parts[1];
  const chatId    = ctx.chat?.id;
  const messageId = ctx.callbackQuery.message?.message_id;

  if (action === 'close') {
    await ctx.answerCallbackQuery();
    if (chatId && messageId) {
      await ctx.api.deleteMessage(chatId, messageId).catch(() => {});
      await clearState(chatId, messageId);
    }
    return;
  }

  if (action === 'cats') {
    await ctx.answerCallbackQuery();
    return renderCategoriesView(ctx, { editChatId: chatId, editMessageId: messageId });
  }

  if (action === 'all') {
    await ctx.answerCallbackQuery();
    return renderListView(ctx, freshListState({ category_id: null, no_category: false }), {
      editChatId: chatId, editMessageId: messageId,
    });
  }

  if (action === 'nocat') {
    await ctx.answerCallbackQuery();
    return renderListView(ctx, freshListState({ category_id: null, no_category: true }), {
      editChatId: chatId, editMessageId: messageId,
    });
  }

  if (action === 'cat') {
    const catId = parts[2];
    await ctx.answerCallbackQuery();
    return renderListView(ctx, freshListState({ category_id: catId, no_category: false }), {
      editChatId: chatId, editMessageId: messageId,
    });
  }

  if (action === 'p') {
    // Кнопка «{page}/{pages}» - статический индикатор, без действия.
    if (parts[2] === 'noop') {
      await ctx.answerCallbackQuery();
      return;
    }
    const page = Math.max(1, Number(parts[2]) || 1);
    const state = await loadState(chatId, messageId);
    if (!state || state.view !== 'list') {
      // State expired - show categories instead (graceful degradation).
      await ctx.answerCallbackQuery();
      return renderCategoriesView(ctx, { editChatId: chatId, editMessageId: messageId });
    }
    state.page = page;
    await ctx.answerCallbackQuery();
    return renderListView(ctx, state, { editChatId: chatId, editMessageId: messageId });
  }

  if (action === 'i') {
    const productId = parts[2];
    const state = await loadState(chatId, messageId);
    await ctx.answerCallbackQuery();
    return renderCardView(ctx, productId, state, { deleteChatId: chatId, deleteMessageId: messageId });
  }

  if (action === 'back') {
    // Card → List (state.return хранит фильтры списка)
    const state = await loadState(chatId, messageId);
    await ctx.answerCallbackQuery();
    if (!state || !state.return) {
      // No return-to-list state - fall back to categories.
      return renderCategoriesView(ctx, { deleteChatId: chatId, deleteMessageId: messageId });
    }
    return renderListView(ctx, state.return, { deleteChatId: chatId, deleteMessageId: messageId });
  }

  if (action === 'search') {
    const sub = parts[2];

    if (sub === 'clear') {
      const state = await loadState(chatId, messageId);
      if (state && state.view === 'list') {
        state.search = null;
        state.page = 1;
        await ctx.answerCallbackQuery();
        return renderListView(ctx, state, { editChatId: chatId, editMessageId: messageId });
      }
      await ctx.answerCallbackQuery();
      return;
    }

    if (sub === 'enter') {
      // Запоминаем контекст списка, чтобы после ввода вернуться сюда.
      const state = await loadState(chatId, messageId);
      ctx.session.product_search = {
        chat_id:     chatId,
        message_id:  messageId,
        category_id: state?.category_id || null,
        no_category: !!state?.no_category,
      };
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('productSearch');
      return;
    }
  }

  // Неизвестное действие - закроем callback тихо.
  await ctx.answerCallbackQuery();
}

// - Вспомогательная: чистый state для view='list' -
function freshListState({ category_id, no_category, search = null, page = 1 }) {
  return { view: 'list', category_id, no_category: !!no_category, search, page };
}

// - Stage 1: Categories view -
async function renderCategoriesView(ctx, opts) {
  const lang = ctx.locale;
  const cats = await loadCategoriesWithCounts(ctx.shop.id);
  const total = cats.reduce((s, c) => s + Number(c.product_count), 0);

  if (total === 0) {
    const text = ctx.t('seller.products.empty');
    return sendOrEdit(ctx, text, undefined, opts, /*saveAs*/null);
  }

  const headerLines = [
    ctx.t('seller.products.cats_title', { total }),
    '',
    ctx.t('seller.products.cats_pick'),
  ];
  const text = headerLines.join('\n');

  // Разделяем «настоящие» категории и псевдо «Без категории»
  const realCats = cats.filter((c) => c.id !== null);
  const noCat    = cats.find((c) => c.id === null) || null;

  const kb = new InlineKeyboard();
  realCats.forEach((c, i) => {
    const name = lang === 'uz' ? c.name_uz : c.name_ru;
    kb.text(`${c.emoji || '📦'} ${name} (${c.product_count})`, `mp:cat:${c.id}`);
    if (i % 2 === 1) kb.row();
  });
  if (realCats.length % 2 === 1) kb.row();

  // Универсальные действия
  kb.text(ctx.t('seller.products.btn_all', { count: total }), 'mp:all').row();
  if (noCat) {
    kb.text(ctx.t('seller.products.btn_no_category', { count: noCat.product_count }), 'mp:nocat').row();
  }
  kb.text(ctx.t('seller.products.btn_search_all'), 'mp:search:enter').row();
  kb.text(ctx.t('seller.products.btn_close'), 'mp:close');

  return sendOrEdit(ctx, text, kb, opts, { view: 'categories' });
}

// - Stage 2: Paginated list view -
async function renderListView(ctx, state, opts) {
  const lang = ctx.locale;

  // Сначала параллельно: count + headerName.
  // По count'у узнаем totalPages, нормализуем state.page, и только тогда грузим items.
  const [total, headerName] = await Promise.all([
    countProducts(ctx.shop.id, state),
    categoryHeader(ctx, state),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.max(1, Math.min(state.page || 1, totalPages));
  state.page = page;
  const items = await listProducts(ctx.shop.id, state);
  const headerLines = [
    ctx.t('seller.products.list_title', {
      header: headerName,
      total,
      page,
      pages: totalPages,
    }),
  ];
  if (state.search) {
    headerLines.push(ctx.t('seller.products.list_search_active', { query: state.search }));
  }
  if (total === 0) {
    headerLines.push('');
    headerLines.push(ctx.t('seller.products.list_empty'));
  }
  const text = headerLines.join('\n');

  // Клавиатура
  const kb = new InlineKeyboard();
  // 1 строка = 1 кнопка-товар
  items.forEach((p, i) => {
    const num    = (page - 1) * PER_PAGE + i + 1;
    const price  = formatUZS(p.price, lang);
    const stock  = p.stock;
    // Имя товара обрезаем чтобы влезло в ширину inline-кнопки.
    const nameTrim = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name;
    kb.text(`${num}. ${nameTrim}  ·  ${price}  ·  📦${stock}`, `mp:i:${p.id}`).row();
  });

  // Пагинация (только если страниц больше одной)
  if (totalPages > 1) {
    if (page > 1)         kb.text('«', `mp:p:${page - 1}`);
    kb.text(`${page}/${totalPages}`, 'mp:p:noop');
    if (page < totalPages) kb.text('»', `mp:p:${page + 1}`);
    kb.row();
  }

  // Действия
  kb.text(ctx.t('seller.products.btn_search'), 'mp:search:enter');
  if (state.search) {
    kb.text(ctx.t('seller.products.btn_search_clear'), 'mp:search:clear');
  }
  kb.row();
  kb.text(ctx.t('seller.products.btn_to_categories'), 'mp:cats');

  return sendOrEdit(ctx, text, kb, opts, state);
}

// - Stage 4: Single product card -
async function renderCardView(ctx, productId, listState, opts) {
  const lang = ctx.locale;

  const { rows } = await query(
    `SELECT p.*, c.name_ru AS cat_ru, c.name_uz AS cat_uz, c.emoji
       FROM catalog.products p
       LEFT JOIN catalog.categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.shop_id = $2`,
    [productId, ctx.shop.id],
  );
  const p = rows[0];

  if (!p || !p.is_active) {
    if (opts.deleteChatId && opts.deleteMessageId) {
      await ctx.api.deleteMessage(opts.deleteChatId, opts.deleteMessageId).catch(() => {});
    }
    await ctx.reply(ctx.t('seller.products.card_not_found'));
    // Возвращаемся к списку - товар мог быть только что удалён/скрыт.
    if (listState && listState.view === 'list') {
      return renderListView(ctx, listState, { send: true });
    }
    return;
  }

  const catName = lang === 'uz' ? p.cat_uz : p.cat_ru;
  const stockTxt = lang === 'uz' ? `📊 Sklada: ${p.stock}` : `📊 На складе: ${p.stock}`;
  const caption = [
    `*${p.name}*`,
    catName ? `${p.emoji || '📦'} ${catName}` : null,
    `💰 ${formatUZS(p.price, lang)}`,
    stockTxt,
  ].filter(Boolean).join('\n');

  const kb = new InlineKeyboard()
    .text(lang === 'uz' ? '💰 Narx'      : '💰 Цена',    `prod_mgr:price:${p.id}`)
    .text(lang === 'uz' ? '📊 Qoldiq'    : '📊 Остаток', `prod_mgr:stock:${p.id}`).row()
    .text(lang === 'uz' ? '👁 Yashirish' : '👁 Скрыть',  `prod_mgr:toggle:${p.id}`)
    .text(lang === 'uz' ? '🗑 Oʻchirish' : '🗑 Удалить', `prod_mgr:delete:${p.id}`).row()
    .text(ctx.t('seller.products.btn_back_to_list'), 'mp:back');

  // Параллельно: удаляем старый список + отправляем фото-карточку.
  // На UX это даёт ~½ задержки vs последовательного flow (раньше шло
  // ~deleteMessage 300ms → sendPhoto 500ms; теперь обе одновременно).
  // Кратковременно может быть видно «оба» сообщения, но пользователь и
  // так смотрит вниз - новое появляется поверх старого, и старое исчезает.
  const deletePromise = (opts.deleteChatId && opts.deleteMessageId)
    ? ctx.api.deleteMessage(opts.deleteChatId, opts.deleteMessageId).catch(() => {})
    : Promise.resolve();

  const sendPromise = p.photo_file_id
    ? ctx.replyWithPhoto(p.photo_file_id, {
        caption, parse_mode: 'Markdown', reply_markup: kb,
      }).catch(() => ctx.reply(caption, { parse_mode: 'Markdown', reply_markup: kb }))
    : ctx.reply(caption, { parse_mode: 'Markdown', reply_markup: kb });

  const [, sent] = await Promise.all([deletePromise, sendPromise]);

  // Чистим Redis state старого сообщения (delete уже произошёл).
  if (opts.deleteChatId && opts.deleteMessageId) {
    clearState(opts.deleteChatId, opts.deleteMessageId).catch(() => {});
  }

  await saveState(sent.chat.id, sent.message_id, {
    view: 'card',
    product_id: p.id,
    return: listState && listState.view === 'list'
      ? listState
      : freshListState({ category_id: null, no_category: false }),
  });
}

// - Универсальная отправка/редактирование текстового сообщения -
//
// opts:
//   - {send: true}                               - просто послать новое
//   - {editChatId, editMessageId}                - попытаться edit, упало → delete+send
//   - {deleteChatId, deleteMessageId}            - delete старое, send новое
async function sendOrEdit(ctx, text, kb, opts, stateToSave) {
  const replyMarkup = kb || undefined;

  let chatId, messageId;
  if (opts.editChatId && opts.editMessageId) {
    try {
      const edited = await ctx.api.editMessageText(opts.editChatId, opts.editMessageId, text, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });
      chatId    = opts.editChatId;
      messageId = (edited && typeof edited === 'object' && edited.message_id) || opts.editMessageId;
    } catch (err) {
      // «message is not modified» - пользователь дважды кликнул то же
      // действие, нечего перерисовывать. Просто оставляем как было.
      const desc = err && err.description ? String(err.description) : '';
      if (desc.includes('message is not modified')) {
        return;
      }
      // Иное (старое сообщение / message type mismatch) - удаляем и шлём свежее.
      await ctx.api.deleteMessage(opts.editChatId, opts.editMessageId).catch(() => {});
      await clearState(opts.editChatId, opts.editMessageId);
      const sent = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
      chatId    = sent.chat.id;
      messageId = sent.message_id;
    }
  } else if (opts.deleteChatId && opts.deleteMessageId) {
    // Параллельно delete старого + send нового - экономит ~один Telegram-roundtrip.
    const [, sent] = await Promise.all([
      ctx.api.deleteMessage(opts.deleteChatId, opts.deleteMessageId).catch(() => {}),
      ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup }),
    ]);
    clearState(opts.deleteChatId, opts.deleteMessageId).catch(() => {});
    chatId    = sent.chat.id;
    messageId = sent.message_id;
  } else {
    const sent = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
    chatId    = sent.chat.id;
    messageId = sent.message_id;
  }

  if (stateToSave) {
    await saveState(chatId, messageId, stateToSave);
  }
}

// - DB helpers -
async function loadCategoriesWithCounts(shopId) {
  const { rows } = await query('SELECT * FROM catalog.list_categories_for_seller($1)', [shopId]);
  return rows;
}

async function countProducts(shopId, state) {
  const { rows } = await query(
    'SELECT catalog.count_products_for_seller($1, $2, $3, $4) AS n',
    [shopId, state.category_id || null, !!state.no_category, state.search || null],
  );
  return Number(rows[0]?.n || 0);
}

async function listProducts(shopId, state) {
  const { rows } = await query(
    'SELECT * FROM catalog.list_products_for_seller($1, $2, $3, $4, $5, $6)',
    [shopId, state.category_id || null, !!state.no_category, state.search || null, state.page || 1, PER_PAGE],
  );
  return rows;
}

// - Заголовок списка («Хлеб», «Все товары», «Без категории», «🔎 …»)
async function categoryHeader(ctx, state) {
  const lang = ctx.locale;
  if (state.no_category) {
    return ctx.t('seller.products.header_no_category');
  }
  if (!state.category_id) {
    return ctx.t('seller.products.header_all');
  }
  const { rows } = await query(
    'SELECT name_uz, name_ru, emoji FROM catalog.categories WHERE id = $1',
    [state.category_id],
  );
  const c = rows[0];
  if (!c) return ctx.t('seller.products.header_all');
  const name = lang === 'uz' ? c.name_uz : c.name_ru;
  return `${c.emoji || '📦'} ${name}`;
}

// - Bridge: после успешной подачи поискового запроса -
//
// Вызывается из conversations/productSearch.js, передаёт сюда query
// и оригинальный chat/message_id, чтобы на месте старого сообщения
// открыть отфильтрованный список.
export async function applySearchQuery(ctx, queryText) {
  const search = queryText.trim();
  const ctxBag = ctx.session.product_search || {};
  const { chat_id: chatId, message_id: messageId, category_id, no_category } = ctxBag;
  delete ctx.session.product_search;

  const state = freshListState({
    category_id: category_id || null,
    no_category: !!no_category,
    search: search.length > 0 ? search : null,
  });

  if (chatId && messageId) {
    return renderListView(ctx, state, { editChatId: chatId, editMessageId: messageId });
  }
  return renderListView(ctx, state, { send: true });
}

// - prod_mgr callbacks (price/stock/toggle/delete) -
// Существующая логика, без изменений - все ссылки идут из card view.
export async function handleProductMgrCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const [, action, productId] = data.split(':');
  if (!productId) return ctx.answerCallbackQuery();

  const { rows } = await query(
    `SELECT p.* FROM catalog.products p
      WHERE p.id = $1 AND p.shop_id = $2`,
    [productId, ctx.shop?.id],
  );
  const product = rows[0];
  if (!product) {
    await ctx.answerCallbackQuery(ctx.locale === 'uz' ? 'Topilmadi' : 'Не найдено');
    return;
  }

  if (action === 'price' || action === 'stock') {
    ctx.session.editing_product_id    = productId;
    ctx.session.editing_product_field = action;
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('editProduct');
    return;
  }

  if (action === 'toggle' || action === 'delete') {
    if (action === 'toggle') {
      const next = !product.is_active;
      await callFnRow('catalog.update_product', [productId, null, null, null, null, null, null, next]);
      await ctx.answerCallbackQuery(
        next
          ? (ctx.locale === 'uz' ? '👁 Koʻrsatildi' : '👁 Показан')
          : (ctx.locale === 'uz' ? '👁 Yashirildi'   : '👁 Скрыт'),
      );
    } else {
      await callFnRow('catalog.delete_product', [productId]);
      await ctx.answerCallbackQuery(ctx.locale === 'uz' ? '🗑 Oʻchirildi' : '🗑 Удалён');
    }

    // Возвращаем продавца к списку, чтобы карточка скрытого/удалённого товара
    // не висела с устаревшими кнопками.
    const chatId    = ctx.chat?.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    const state     = await loadState(chatId, messageId);
    if (state && state.return) {
      return renderListView(ctx, state.return, { deleteChatId: chatId, deleteMessageId: messageId });
    }
    if (chatId && messageId) {
      await ctx.api.deleteMessage(chatId, messageId).catch(() => {});
      await clearState(chatId, messageId);
    }
    return renderCategoriesView(ctx, { send: true });
  }
}
