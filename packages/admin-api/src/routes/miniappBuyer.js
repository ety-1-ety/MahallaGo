import { callFn, callFnRow, query, verifyInitData, getRedis, ORDER_ERRORS } from '@mahallago/shared';

// ─────────────────────────────────────────────────────────────────
// Mini App · BUYER routes (`/api/miniapp/buyer/*`)
//
// Stage 2: расширили скаффолд из Stage 1 полноценным набором endpoint'ов:
//   POST   /auth/init                  — initData → JWT cookie
//   GET    /me                         — текущий профиль
//   POST   /me/language                — смена языка (sync с auth.users.language_code)
//   GET    /shops/nearby?lat&lng       — открытые магазины в радиусе 2 км
//   GET    /shops/:id                  — детали магазина + категории с count
//   GET    /shops/:id/products?...     — товары категории (с пагинацией)
//   POST   /orders                     — создать заказ + публикация в Redis pub/sub
//   GET    /orders/me                  — мои заказы
//   GET    /health                     — smoke
//
// Логика create_order повторяет buyer-bot/checkout.js, чтобы оба транспорта
// (бот + Mini App) использовали единый SQL-источник правды.
// ─────────────────────────────────────────────────────────────────

const ORDER_ERROR_CODES = new Set(Object.values(ORDER_ERRORS));

function isOpenNow(workingHours, tz) {
  // Зеркало orders._is_shop_open_now (read-only превью для UI).
  // Если working_hours отсутствуют — считаем «открыто».
  if (!workingHours || typeof workingHours !== 'object') return true;
  if (workingHours.is_24_7 === true) return true;
  const now = new Date();
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'Asia/Tashkent',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = tzFormatter.formatToParts(now);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[parts.find((p) => p.type === 'weekday')?.value];
  const hh = parts.find((p) => p.type === 'hour')?.value;
  const mm = parts.find((p) => p.type === 'minute')?.value;
  const nowMin = (Number(hh) * 60) + Number(mm);
  const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dow];
  const day = workingHours[dayKey];
  if (!day || day.closed) return false;
  if (!day.from || !day.to) return true;
  const [fh, fm] = String(day.from).split(':').map(Number);
  const [th, tm] = String(day.to).split(':').map(Number);
  return nowMin >= (fh * 60 + fm) && nowMin < (th * 60 + tm);
}

export default async function miniappBuyerRoutes(app) {
  app.get('/health', async () => ({ ok: true, role: 'buyer' }));

  // ─── /auth/init ────────────────────────────────────────────────
  app.post('/auth/init', async (request, reply) => {
    const { initData } = request.body || {};
    if (typeof initData !== 'string' || initData.length === 0) {
      return reply.code(400).send({ error: 'INVALID_BODY', detail: 'initData required' });
    }
    const token = process.env.BUYER_BOT_TOKEN;
    if (!token) {
      request.log.error('BUYER_BOT_TOKEN env missing');
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

    const jwtToken = app.signMiniappToken({
      payload: { uid: user.id, tg: Number(user.telegram_id) },
      role: 'buyer',
    });
    reply.setCookie(
      app.miniappCookieName('buyer'),
      jwtToken,
      app.miniappCookieOptions('buyer'),
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
    };
  });

  // ─── /me ───────────────────────────────────────────────────────
  app.get('/me', { preHandler: app.requireBuyer }, async (request) => {
    const { rows } = await query(
      'SELECT id, telegram_id, first_name, last_name, username, language_code, phone FROM auth.users WHERE id = $1',
      [request.miniappUser.id],
    );
    const u = rows[0];
    if (!u) return { user: null };
    return {
      user: {
        id: u.id,
        telegram_id: Number(u.telegram_id),
        first_name: u.first_name,
        last_name: u.last_name,
        username: u.username,
        language: u.language_code,
        phone: u.phone,
      },
    };
  });

  // ─── POST /me/language ─────────────────────────────────────────
  app.post('/me/language', { preHandler: app.requireBuyer }, async (request, reply) => {
    const { lang } = request.body || {};
    if (lang !== 'uz' && lang !== 'ru') {
      return reply.code(400).send({ error: 'INVALID_LANGUAGE_CODE' });
    }
    try {
      await callFnRow('auth.set_language', [request.miniappUser.id, lang]);
      return { ok: true, language: lang };
    } catch (err) {
      const code = err && err.code ? err.code : 'INTERNAL_ERROR';
      return reply.code(400).send({ error: code });
    }
  });

  // ─── GET /shops/nearby ─────────────────────────────────────────
  app.get('/shops/nearby', { preHandler: app.requireBuyer }, async (request, reply) => {
    const lat = Number(request.query.lat);
    const lng = Number(request.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.code(400).send({ error: 'INVALID_COORDINATES' });
    }
    const radius = Number(request.query.radius_m) || 2000;
    const rows = await callFn('shops.find_nearby', [lat, lng, radius, 30, 0]);
    return {
      shops: rows.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        photo_path: null, // фото магазина пока не отдаём в превью
        distance_m: Math.round(s.distance_m),
        is_open_now: isOpenNow(s.working_hours, s.timezone),
        open_until: null,
        min_order_amount: Number(s.min_order_amount),
        max_order_amount: s.max_order_amount === null ? null : Number(s.max_order_amount),
        delivery_fee: Number(s.delivery_fee),
        free_delivery_from: s.free_delivery_from === null ? null : Number(s.free_delivery_from),
      })),
    };
  });

  // ─── GET /shops/:id ────────────────────────────────────────────
  app.get('/shops/:id', { preHandler: app.requireBuyer }, async (request, reply) => {
    const { id } = request.params;
    const { rows } = await query(
      `SELECT id, name, description, category, photo_file_id, min_order_amount, max_order_amount,
              delivery_fee, free_delivery_from, delivery_radius_m, is_accepting_orders, working_hours, timezone, status
         FROM shops.shops WHERE id = $1`,
      [id],
    );
    const shop = rows[0];
    if (!shop || shop.status !== 'active') {
      return reply.code(404).send({ error: 'SHOP_NOT_FOUND' });
    }
    const cats = await callFn('catalog.list_categories_with_counts', [id]);
    return {
      shop: {
        id: shop.id,
        name: shop.name,
        description: shop.description,
        category: shop.category,
        photo_path: null,
        is_open_now: isOpenNow(shop.working_hours, shop.timezone),
        open_until: null,
        min_order_amount: Number(shop.min_order_amount),
        max_order_amount: shop.max_order_amount === null ? null : Number(shop.max_order_amount),
        delivery_fee: Number(shop.delivery_fee),
        free_delivery_from: shop.free_delivery_from === null ? null : Number(shop.free_delivery_from),
        is_accepting_orders: shop.is_accepting_orders,
      },
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name_ru, // buyer-web сам определяет язык на фронте; на бэке отдаём оба:
        name_uz: c.name_uz,
        name_ru: c.name_ru,
        emoji: c.emoji,
        product_count: Number(c.product_count),
      })),
    };
  });

  // ─── GET /shops/:id/products ───────────────────────────────────
  app.get('/shops/:id/products', { preHandler: app.requireBuyer }, async (request, reply) => {
    const { id } = request.params;
    const categoryId = request.query.category_id || null;
    const page = Math.max(1, Number(request.query.page) || 1);
    const perPage = Math.min(100, Number(request.query.per_page) || 50);

    const { rows: shopRow } = await query('SELECT status FROM shops.shops WHERE id = $1', [id]);
    if (!shopRow[0] || shopRow[0].status !== 'active') {
      return reply.code(404).send({ error: 'SHOP_NOT_FOUND' });
    }
    const rows = await callFn('catalog.list_by_category', [id, categoryId, page, perPage]);
    return {
      products: rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: Number(p.stock),
        photo_path: p.photo_path,
        category_id: p.category_id,
      })),
      page,
      per_page: perPage,
    };
  });

  // ─── GET /shops/recent — магазины из истории заказов покупателя ──
  // Для блока «Заказать снова» на главной: вернуться в магазин без
  // повторного запроса геолокации.
  app.get('/shops/recent', { preHandler: app.requireBuyer }, async (request) => {
    const { rows } = await query(
      `SELECT s.id, s.name, s.working_hours, s.timezone, MAX(o.created_at) AS last_at
         FROM orders.orders o
         JOIN shops.shops s ON s.id = o.shop_id
        WHERE o.buyer_id = $1 AND s.status = 'active'
        GROUP BY s.id, s.name, s.working_hours, s.timezone
        ORDER BY last_at DESC
        LIMIT 6`,
      [request.miniappUser.id],
    );
    return {
      shops: rows.map((s) => ({
        id: s.id,
        name: s.name,
        is_open_now: isOpenNow(s.working_hours, s.timezone),
      })),
    };
  });

  // ─── POST /orders ──────────────────────────────────────────────
  app.post('/orders', { preHandler: app.requireBuyer }, async (request, reply) => {
    const { shop_id, items, delivery_lat, delivery_lng, delivery_address, phone, notes } = request.body || {};

    if (!shop_id || typeof shop_id !== 'string') {
      return reply.code(400).send({ error: 'INVALID_BODY', detail: 'shop_id required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'EMPTY_CART' });
    }
    if (!delivery_address || typeof delivery_address !== 'string' || !delivery_address.trim()) {
      return reply.code(400).send({ error: 'ADDRESS_REQUIRED' });
    }
    // Координаты опциональны для текстового адреса. Если есть — должны быть валидны.
    const lat = delivery_lat === null || delivery_lat === undefined ? null : Number(delivery_lat);
    const lng = delivery_lng === null || delivery_lng === undefined ? null : Number(delivery_lng);
    if ((lat === null) !== (lng === null)) {
      return reply.code(400).send({ error: 'INVALID_COORDINATES' });
    }
    if (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      return reply.code(400).send({ error: 'INVALID_COORDINATES' });
    }

    // Если координат нет — возьмём центр магазина (доставка точно в радиусе).
    let finalLat = lat;
    let finalLng = lng;
    if (finalLat === null) {
      const { rows } = await query(
        `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
           FROM shops.shops WHERE id = $1`,
        [shop_id],
      );
      const sh = rows[0];
      if (!sh) return reply.code(404).send({ error: 'SHOP_NOT_FOUND' });
      finalLat = Number(sh.lat);
      finalLng = Number(sh.lng);
    }

    // Сохраняем телефон в auth.users.phone (если передали).
    if (phone && typeof phone === 'string' && phone.trim()) {
      try {
        await query('UPDATE auth.users SET phone = $2, updated_at = NOW() WHERE id = $1', [
          request.miniappUser.id,
          phone.trim(),
        ]);
      } catch (e) {
        request.log.warn({ err: e }, 'phone update failed (non-critical)');
      }
    }

    let order;
    try {
      order = await callFnRow('orders.create_order', [
        request.miniappUser.id,
        shop_id,
        JSON.stringify(items.map((i) => ({ product_id: i.product_id, qty: Number(i.qty) || 0 }))),
        finalLat,
        finalLng,
        delivery_address.trim(),
        notes || null,
        'cash',
      ]);
    } catch (err) {
      const code = err && err.code ? err.code : null;
      if (code && ORDER_ERROR_CODES.has(code)) {
        return reply.code(400).send({ error: code, detail: err.detail || null });
      }
      request.log.error({ err }, 'create_order failed');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }

    // Redis pub/sub — тот же канал, что использует buyer-bot/checkout.js
    try {
      const { rows: ownerRows } = await query(
        `SELECT u.telegram_id FROM auth.users u
           JOIN shops.shops s ON s.owner_id = u.id
          WHERE s.id = $1`,
        [shop_id],
      );
      const ownerTgId = ownerRows[0]?.telegram_id || null;
      const channel = process.env.REDIS_CHANNEL_NEW_ORDER || 'orders:new';
      await getRedis().publish(channel, JSON.stringify({
        order_id: order.id,
        shop_id,
        owner_telegram_id: ownerTgId,
      }));
    } catch (err) {
      request.log.warn({ err }, 'redis publish orders:new failed (non-critical)');
    }

    return {
      order: {
        id: order.id,
        number: Number(order.number),
        status: order.status,
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        delivery_fee: Number(order.delivery_fee),
        created_at: order.created_at,
      },
    };
  });

  // ─── GET /orders/me ────────────────────────────────────────────
  app.get('/orders/me', { preHandler: app.requireBuyer }, async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const perPage = Math.min(50, Number(request.query.per_page) || 20);
    const statusFilter = request.query.status || null;
    const rows = await callFn('orders.list_by_buyer', [
      request.miniappUser.id,
      statusFilter,
      page,
      perPage,
    ]);
    return {
      orders: rows.map((o) => ({
        id: o.id,
        number: Number(o.number),
        shop_id: o.shop_id,
        shop_name: o.shop_name,
        shop_phone: o.shop_phone,
        subtotal: Number(o.subtotal),
        delivery_fee: Number(o.delivery_fee),
        total: Number(o.total),
        status: o.status,
        created_at: o.created_at,
      })),
      page,
      per_page: perPage,
    };
  });
}
