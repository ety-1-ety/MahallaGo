import { callFn, callFnRow, query, verifyInitData } from '@mahallago/shared';
import { savePhotoUpload } from '../services/uploadPhoto.js';

// ─────────────────────────────────────────────────────────────────
// Mini App · SELLER routes (`/api/miniapp/seller/*`)
//
// Stage 4: расширили Stage-1 скаффолд endpoint'ами для управления товарами.
// Регистрация / заказы / настройки магазина — остаются в seller-bot.
//
//   POST   /auth/init                          — initData → JWT cookie + shop
//   GET    /me, /shop/me                       — текущие user/shop
//   POST   /me/language                        — смена языка
//   GET    /products?category_id&search&page   — список товаров магазина
//   GET    /products/categories                — категории + count в магазине
//   GET    /products/:id                       — деталь товара
//   POST   /products                           — multipart: name/category/price/stock/photo?
//   PATCH  /products/:id                       — частичный update
//   DELETE /products/:id                       — soft delete
//
// Photo upload идёт через @fastify/multipart, sharp-pipeline в shared.
// ─────────────────────────────────────────────────────────────────

const VALID_PRODUCT_ERRORS = new Set([
  'INVALID_PRODUCT_NAME', 'INVALID_PRODUCT_PRICE', 'INVALID_PRODUCT_STOCK', 'PRODUCT_NOT_FOUND',
]);

async function ensureOwnedProduct(shopId, productId) {
  const { rows } = await query(
    'SELECT id FROM catalog.products WHERE id = $1 AND shop_id = $2',
    [productId, shopId],
  );
  return rows[0] ? true : false;
}

export default async function miniappSellerRoutes(app) {
  // @fastify/multipart регистрируем ТОЛЬКО на этом scope (не на buyer).
  // Лимиты: 1 файл, 6 МБ.
  const multipart = (await import('@fastify/multipart')).default;
  await app.register(multipart, {
    limits: {
      fileSize: 6 * 1024 * 1024,
      files: 1,
      fields: 20,
    },
  });

  app.get('/health', async () => ({ ok: true, role: 'seller' }));

  // ─── /auth/init ────────────────────────────────────────────────
  app.post('/auth/init', async (request, reply) => {
    const { initData } = request.body || {};
    if (typeof initData !== 'string' || initData.length === 0) {
      return reply.code(400).send({ error: 'INVALID_BODY', detail: 'initData required' });
    }

    const token = process.env.SELLER_BOT_TOKEN;
    if (!token) {
      request.log.error('SELLER_BOT_TOKEN env missing');
      return reply.code(500).send({ error: 'AUTH_NOT_CONFIGURED' });
    }

    let verified;
    try {
      verified = verifyInitData(initData, token);
    } catch (err) {
      return reply.code(401).send({ error: err.code || 'INVALID_INIT_DATA' });
    }

    const user = await callFnRow('auth.upsert_user', [
      verified.user.id,
      verified.user.username || null,
      verified.user.first_name || null,
      verified.user.last_name || null,
      verified.user.language_code || null,
    ]);
    if (user.is_blocked) {
      return reply.code(403).send({ error: 'USER_BLOCKED' });
    }

    const { rows: shops } = await query(
      `SELECT id, name, description, photo_file_id, status, category, is_accepting_orders,
              min_order_amount, max_order_amount, delivery_fee, free_delivery_from, delivery_radius_m
         FROM shops.shops
        WHERE owner_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    );
    const shop = shops[0] || null;

    if (!shop) {
      return reply.code(409).send({
        error: 'NO_SHOP',
        detail: 'register a shop via @MahallaGo_seller_bot first',
      });
    }
    if (shop.status !== 'active') {
      return reply.code(403).send({ error: 'SHOP_INACTIVE', status: shop.status });
    }

    const jwtToken = app.signMiniappToken({
      payload: { uid: user.id, tg: Number(user.telegram_id), shop_id: shop.id },
      role: 'seller',
    });
    reply.setCookie(
      app.miniappCookieName('seller'),
      jwtToken,
      app.miniappCookieOptions('seller'),
    );

    return {
      user: {
        id: user.id,
        telegram_id: Number(user.telegram_id),
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        language: user.language_code,
        phone: user.phone,
      },
      shop: {
        id: shop.id,
        name: shop.name,
        description: shop.description,
        category: shop.category,
        is_accepting_orders: shop.is_accepting_orders,
        min_order_amount: Number(shop.min_order_amount),
        max_order_amount: shop.max_order_amount === null ? null : Number(shop.max_order_amount),
        delivery_fee: Number(shop.delivery_fee),
        free_delivery_from: shop.free_delivery_from === null ? null : Number(shop.free_delivery_from),
        delivery_radius_m: Number(shop.delivery_radius_m),
      },
    };
  });

  // ─── /me ───────────────────────────────────────────────────────
  app.get('/me', { preHandler: app.requireSeller }, async (request) => {
    const { rows } = await query(
      'SELECT id, telegram_id, first_name, last_name, username, language_code, phone FROM auth.users WHERE id = $1',
      [request.miniappUser.id],
    );
    const u = rows[0];
    return {
      user: u ? {
        id: u.id,
        telegram_id: Number(u.telegram_id),
        first_name: u.first_name,
        last_name: u.last_name,
        username: u.username,
        language: u.language_code,
        phone: u.phone,
      } : null,
      shop: request.miniappShop,
    };
  });

  // ─── GET /shop/me ──────────────────────────────────────────────
  app.get('/shop/me', { preHandler: app.requireSeller }, async (request, reply) => {
    const { rows } = await query(
      `SELECT id, name, description, category, photo_file_id, status, is_accepting_orders,
              min_order_amount, max_order_amount, delivery_fee, free_delivery_from, delivery_radius_m,
              working_hours, timezone, address
         FROM shops.shops WHERE id = $1`,
      [request.miniappShop.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'SHOP_NOT_FOUND' });
    const s = rows[0];
    return {
      shop: {
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        photo_file_id: s.photo_file_id,
        status: s.status,
        is_accepting_orders: s.is_accepting_orders,
        min_order_amount: Number(s.min_order_amount),
        max_order_amount: s.max_order_amount === null ? null : Number(s.max_order_amount),
        delivery_fee: Number(s.delivery_fee),
        free_delivery_from: s.free_delivery_from === null ? null : Number(s.free_delivery_from),
        delivery_radius_m: Number(s.delivery_radius_m),
        working_hours: s.working_hours,
        timezone: s.timezone,
        address: s.address,
      },
    };
  });

  // ─── POST /me/language ─────────────────────────────────────────
  app.post('/me/language', { preHandler: app.requireSeller }, async (request, reply) => {
    const { lang } = request.body || {};
    if (lang !== 'uz' && lang !== 'ru') {
      return reply.code(400).send({ error: 'INVALID_LANGUAGE_CODE' });
    }
    try {
      await callFnRow('auth.set_language', [request.miniappUser.id, lang]);
      return { ok: true, language: lang };
    } catch (err) {
      return reply.code(400).send({ error: err.code || 'INTERNAL_ERROR' });
    }
  });

  // ─── GET /products/categories ──────────────────────────────────
  app.get('/products/categories', { preHandler: app.requireSeller }, async (request) => {
    // catalog.list_categories_for_seller — все категории магазина (без stock-фильтра)
    const rows = await callFn('catalog.list_categories_for_seller', [request.miniappShop.id]);
    return {
      categories: rows.map((c) => ({
        id: c.id,
        name_uz: c.name_uz,
        name_ru: c.name_ru,
        emoji: c.emoji,
        product_count: Number(c.product_count),
      })),
    };
  });

  // ─── GET /products ─────────────────────────────────────────────
  app.get('/products', { preHandler: app.requireSeller }, async (request) => {
    const shopId = request.miniappShop.id;
    const categoryId = request.query.category_id || null;
    const noCategory = String(request.query.no_category || '') === 'true';
    const search = (request.query.search || '').toString().trim() || null;
    const page = Math.max(1, Number(request.query.page) || 1);
    const perPage = Math.min(100, Number(request.query.per_page) || 30);

    // raw SQL: те же фильтры что в catalog.{list,count}_products_for_seller,
    // но с join'ом на категорию для отображения имени в карточке.
    const offset = (page - 1) * perPage;
    const params = [shopId, categoryId, noCategory, search, perPage, offset];
    const filterSql = `
      WHERE p.shop_id   = $1
        AND p.is_active = TRUE
        AND (
          ($3::BOOLEAN AND p.category_id IS NULL)
          OR (NOT $3::BOOLEAN AND $2::UUID IS NOT NULL AND p.category_id = $2::UUID)
          OR (NOT $3::BOOLEAN AND $2::UUID IS NULL)
        )
        AND ($4::TEXT IS NULL OR length(trim($4::TEXT)) = 0 OR p.name ILIKE '%' || $4::TEXT || '%')
    `;
    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.is_active, p.photo_path, p.category_id,
              c.name_ru AS category_name_ru, c.name_uz AS category_name_uz, c.emoji AS category_emoji
         FROM catalog.products p
         LEFT JOIN catalog.categories c ON c.id = p.category_id
         ${filterSql}
        ORDER BY p.name ASC, p.id ASC
        LIMIT $5 OFFSET $6`,
      params,
    );
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::BIGINT AS total
         FROM catalog.products p ${filterSql}`,
      [shopId, categoryId, noCategory, search],
    );
    const total = Number(countRows[0]?.total || 0);

    return {
      products: rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: Number(p.stock),
        is_active: p.is_active,
        photo_path: p.photo_path,
        category_id: p.category_id,
        category_name_ru: p.category_name_ru,
        category_name_uz: p.category_name_uz,
        category_emoji: p.category_emoji,
      })),
      page,
      per_page: perPage,
      total,
    };
  });

  // ─── GET /products/:id ─────────────────────────────────────────
  app.get('/products/:id', { preHandler: app.requireSeller }, async (request, reply) => {
    const { id } = request.params;
    const { rows } = await query(
      `SELECT p.*, c.name_ru AS category_name_ru, c.name_uz AS category_name_uz
         FROM catalog.products p
         LEFT JOIN catalog.categories c ON c.id = p.category_id
        WHERE p.id = $1 AND p.shop_id = $2`,
      [id, request.miniappShop.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
    const p = rows[0];
    return {
      product: {
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: Number(p.stock),
        is_active: p.is_active,
        photo_path: p.photo_path,
        category_id: p.category_id,
        category_name_ru: p.category_name_ru,
        category_name_uz: p.category_name_uz,
      },
    };
  });

  // ─── POST /products ────────────────────────────────────────────
  // multipart: name, category_id, description?, price, stock, photo (optional)
  app.post('/products', { preHandler: app.requireSeller }, async (request, reply) => {
    let name, categoryId, description, price, stock, photoFilename = null;

    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'EXPECTED_MULTIPART' });
    }

    const parts = request.parts();
    try {
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname !== 'photo') {
            try { for await (const _ of part.file) { /* drain */ } } catch { /* noop */ }
            continue;
          }
          const saved = await savePhotoUpload(part);
          photoFilename = saved.filename;
        } else {
          if (part.fieldname === 'name')         name = String(part.value || '').trim();
          if (part.fieldname === 'category_id')  categoryId = String(part.value || '').trim() || null;
          if (part.fieldname === 'description')  description = String(part.value || '').trim() || null;
          if (part.fieldname === 'price')        price = Number(part.value);
          if (part.fieldname === 'stock')        stock = Number(part.value);
        }
      }
    } catch (err) {
      if (err.code === 'UNSUPPORTED_MIME' || err.code === 'FILE_TOO_LARGE' || err.code === 'NO_FILE') {
        return reply.code(400).send({ error: err.code, detail: err.message });
      }
      request.log.error({ err }, 'product upload failed');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }

    if (!name) return reply.code(400).send({ error: 'INVALID_PRODUCT_NAME' });
    if (!Number.isFinite(price) || price < 0) return reply.code(400).send({ error: 'INVALID_PRODUCT_PRICE' });
    if (!Number.isFinite(stock) || stock < 0) return reply.code(400).send({ error: 'INVALID_PRODUCT_STOCK' });

    let product;
    try {
      product = await callFnRow('catalog.add_product', [
        request.miniappShop.id,
        categoryId || null,
        name,
        description,
        null,                   // photo_file_id — у нас локальное фото, не Telegram
        price,
        Math.round(stock),
      ]);
    } catch (err) {
      const pgCode = err && err.code ? err.code : null;
      if (pgCode === '23505') {
        return reply.code(409).send({ error: 'DUPLICATE_PRODUCT_NAME' });
      }
      if (pgCode && VALID_PRODUCT_ERRORS.has(pgCode)) {
        return reply.code(400).send({ error: pgCode });
      }
      request.log.error({ err }, 'add_product failed');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }

    if (photoFilename) {
      try {
        await query('UPDATE catalog.products SET photo_path = $1 WHERE id = $2', [photoFilename, product.id]);
        product.photo_path = photoFilename;
      } catch (e) {
        request.log.warn({ err: e }, 'photo_path update failed (product still created)');
      }
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        stock: Number(product.stock),
        is_active: product.is_active,
        photo_path: product.photo_path,
        category_id: product.category_id,
      },
    };
  });

  // ─── PATCH /products/:id ───────────────────────────────────────
  // multipart-friendly: либо JSON, либо multipart (если меняется фото).
  app.patch('/products/:id', { preHandler: app.requireSeller }, async (request, reply) => {
    const { id } = request.params;
    if (!(await ensureOwnedProduct(request.miniappShop.id, id))) {
      return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
    }

    let name, categoryId, description, price, stock, isActive, photoFilename = null;
    let hasPhotoField = false;

    if (request.isMultipart()) {
      const parts = request.parts();
      try {
        for await (const part of parts) {
          if (part.type === 'file') {
            if (part.fieldname !== 'photo') {
              try { for await (const _ of part.file) { /* drain */ } } catch { /* noop */ }
              continue;
            }
            hasPhotoField = true;
            const saved = await savePhotoUpload(part);
            photoFilename = saved.filename;
          } else {
            if (part.fieldname === 'name')        name = String(part.value || '').trim();
            if (part.fieldname === 'category_id') categoryId = String(part.value || '').trim() || null;
            if (part.fieldname === 'description') description = String(part.value || '').trim();
            if (part.fieldname === 'price')       price = Number(part.value);
            if (part.fieldname === 'stock')       stock = Number(part.value);
            if (part.fieldname === 'is_active')   isActive = String(part.value) === 'true';
          }
        }
      } catch (err) {
        if (err.code === 'UNSUPPORTED_MIME' || err.code === 'FILE_TOO_LARGE') {
          return reply.code(400).send({ error: err.code });
        }
        throw err;
      }
    } else {
      const body = request.body || {};
      // null трактуем как «не меняем», иначе String(null)='null' попадёт в SQL и
      // перезапишет имя на строку "null". Пустая строка после trim тоже = пропуск.
      if (body.name !== undefined && body.name !== null) {
        const trimmed = String(body.name).trim();
        name = trimmed.length > 0 ? trimmed : null;
      }
      if (body.category_id !== undefined) categoryId = body.category_id || null;
      if (body.description !== undefined && body.description !== null) description = String(body.description);
      if (body.price !== undefined)       price = Number(body.price);
      if (body.stock !== undefined)       stock = Number(body.stock);
      if (body.is_active !== undefined)   isActive = Boolean(body.is_active);
    }

    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return reply.code(400).send({ error: 'INVALID_PRODUCT_PRICE' });
    }
    if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) {
      return reply.code(400).send({ error: 'INVALID_PRODUCT_STOCK' });
    }

    let product;
    try {
      product = await callFnRow('catalog.update_product', [
        id,
        categoryId === undefined ? null : categoryId,
        name || null,
        description === undefined ? null : description,
        null,                 // photo_file_id не используем
        price === undefined ? null : price,
        stock === undefined ? null : Math.round(stock),
        isActive === undefined ? null : isActive,
      ]);
    } catch (err) {
      const pgCode = err && err.code ? err.code : null;
      if (pgCode === '23505') return reply.code(409).send({ error: 'DUPLICATE_PRODUCT_NAME' });
      if (pgCode === 'PRODUCT_NOT_FOUND' || (pgCode && VALID_PRODUCT_ERRORS.has(pgCode))) {
        return reply.code(400).send({ error: pgCode });
      }
      request.log.error({ err }, 'update_product failed');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }

    if (hasPhotoField && photoFilename) {
      await query('UPDATE catalog.products SET photo_path = $1 WHERE id = $2', [photoFilename, product.id]);
      product.photo_path = photoFilename;
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        stock: Number(product.stock),
        is_active: product.is_active,
        photo_path: product.photo_path,
        category_id: product.category_id,
      },
    };
  });

  // ─── DELETE /products/:id (soft) ───────────────────────────────
  app.delete('/products/:id', { preHandler: app.requireSeller }, async (request, reply) => {
    const { id } = request.params;
    if (!(await ensureOwnedProduct(request.miniappShop.id, id))) {
      return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
    }
    try {
      await callFnRow('catalog.delete_product', [id]);
      return { ok: true };
    } catch (err) {
      const pgCode = err && err.code ? err.code : null;
      if (pgCode === 'PRODUCT_NOT_FOUND') {
        return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
      }
      request.log.error({ err }, 'delete_product failed');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });
}
