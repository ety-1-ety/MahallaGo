import { callFnRow, query, verifyInitData } from '@mahallashop/shared';

// ─────────────────────────────────────────────────────────────────
// Mini App · SELLER routes (`/api/miniapp/seller/*`)
//
// На этой стадии — только `/auth/init`, `/health`, `/me` и `/shop/me`.
// Productive endpoint'ы (products CRUD, photo upload) — Стадия 4.
// ─────────────────────────────────────────────────────────────────

export default async function miniappSellerRoutes(app) {
  app.get('/health', async () => ({ ok: true, role: 'seller' }));

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
      return reply.code(401).send({ error: err.code || 'BAD_INIT_DATA' });
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

    // Ищем магазин этого продавца. Если магазина нет — клиент должен
    // увести пользователя в seller-bot для онбординга.
    const { rows: shops } = await query(
      `SELECT id, name, status, is_accepting_orders, min_order_amount, delivery_fee, delivery_radius_m
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
        detail: 'register a shop via @MahallaShop_seller_bot first',
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
        username: user.username,
        language: user.language_code,
      },
      shop,
    };
  });

  app.get('/me', { preHandler: app.requireSeller }, async (request) => {
    return { user: request.miniappUser, shop: request.miniappShop };
  });

  app.get('/shop/me', { preHandler: app.requireSeller }, async (request, reply) => {
    const { rows } = await query(
      'SELECT * FROM shops.shops WHERE id = $1',
      [request.miniappShop.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'SHOP_NOT_FOUND' });
    return { shop: rows[0] };
  });
}
