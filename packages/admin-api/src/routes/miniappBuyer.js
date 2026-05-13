import { callFnRow, verifyInitData } from '@mahallashop/shared';

// ─────────────────────────────────────────────────────────────────
// Mini App · BUYER routes (`/api/miniapp/buyer/*`)
//
// На этом этапе (Стадия 1) реализуем только `/auth/init` и `/health`,
// чтобы публикуемая инфра умела принимать запросы и проверять подпись.
// Остальные endpoint'ы (shops/nearby, orders, …) — Стадия 2.
// ─────────────────────────────────────────────────────────────────

export default async function miniappBuyerRoutes(app) {
  // Health для smoke-теста: «routes зарегистрированы»
  app.get('/health', async () => ({ ok: true, role: 'buyer' }));

  // initData → JWT cookie
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
      const code = err.code || 'BAD_INIT_DATA';
      const status = code === 'EXPIRED' ? 401 : 401;
      return reply.code(status).send({ error: code });
    }

    // Upsert пользователя (та же SQL-функция, что и в боте — единый источник правды).
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
        username: user.username,
        language: user.language_code,
      },
    };
  });

  // /me — кто залогинен (для проверки cookie на фронте)
  app.get('/me', { preHandler: app.requireBuyer }, async (request) => {
    return { user: request.miniappUser };
  });
}
