import { callFnRow, query } from '@mahallashop/shared';

/**
 * POST /api/auth/telegram
 * Body: auth_data от Telegram Login Widget (id, first_name, ..., hash)
 *
 * Логика:
 *   1. verifyTelegramAuth — проверяем hash через bot token
 *   2. Создаём/обновляем auth.users
 *   3. Проверяем доступ: ADMIN_TG_IDS env ИЛИ auth.users.is_admin
 *   4. При первом логине из ADMIN_TG_IDS — поднимаем is_admin=true
 *   5. Выпускаем JWT 24h в httpOnly cookie
 *
 * POST /api/auth/logout — стирает cookie.
 * GET  /api/auth/me     — текущий пользователь по cookie.
 */
export default async function authRoutes(app) {
  app.post('/auth/telegram', async (request, reply) => {
    const authData = request.body;

    if (!app.verifyTelegramAuth(authData)) {
      return reply.code(401).send({ error: 'INVALID_TELEGRAM_AUTH' });
    }

    const tgId = Number(authData.id);
    if (!Number.isFinite(tgId)) {
      return reply.code(400).send({ error: 'INVALID_TELEGRAM_ID' });
    }

    // Upsert
    const user = await callFnRow('auth.upsert_user', [
      tgId,
      authData.username || null,
      authData.first_name || null,
      authData.last_name || null,
      null,
    ]);

    const isWhitelisted = app.adminTgIds.includes(tgId);
    const isDbAdmin     = user.is_admin === true;

    if (!isWhitelisted && !isDbAdmin) {
      return reply.code(403).send({ error: 'NOT_ADMIN' });
    }

    // При первом логине whitelisted-пользователя — отметим is_admin=true
    if (isWhitelisted && !isDbAdmin) {
      await callFnRow('auth.mark_as_admin', [tgId, true]);
    }

    const token = app.jwt.sign({
      sub: user.id,
      tg: tgId,
      name: user.first_name,
    });

    const cookieName = process.env.COOKIE_NAME || 'mhs_admin';
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
      domain: process.env.COOKIE_DOMAIN || undefined,
      maxAge: 24 * 60 * 60,  // 24h в секундах
    });

    return { user: { id: user.id, telegram_id: tgId, first_name: user.first_name, language_code: user.language_code } };
  });

  // Dev-only login: обходит Telegram Login Widget (полезно когда домен бота
  // не настроен или работаешь на localhost). Доступен только если
  // NODE_ENV=development. Принимает tg_id в теле, проверяет что он в
  // ADMIN_TG_IDS, выпускает JWT.
  app.post('/auth/dev-login', async (request, reply) => {
    if (process.env.NODE_ENV !== 'development') {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const tgId = Number(request.body?.tg_id);
    if (!Number.isFinite(tgId)) {
      return reply.code(400).send({ error: 'INVALID_TELEGRAM_ID' });
    }

    if (!app.adminTgIds.includes(tgId)) {
      return reply.code(403).send({ error: 'NOT_IN_WHITELIST' });
    }

    const user = await callFnRow('auth.upsert_user', [
      tgId,
      request.body?.username || null,
      request.body?.first_name || 'Dev',
      request.body?.last_name || 'Admin',
      null,
    ]);
    if (!user.is_admin) {
      await callFnRow('auth.mark_as_admin', [tgId, true]);
    }

    const token = app.jwt.sign({ sub: user.id, tg: tgId, name: user.first_name });

    const cookieName = process.env.COOKIE_NAME || 'mhs_admin';
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return { user: { id: user.id, telegram_id: tgId, first_name: user.first_name, language_code: user.language_code }, dev: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    const cookieName = process.env.COOKIE_NAME || 'mhs_admin';
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.requireAuth }, async (request) => {
    const payload = request.user;
    const { rows } = await query(
      'SELECT id, telegram_id, first_name, last_name, username, language_code, is_admin FROM auth.users WHERE id = $1',
      [payload.sub],
    );
    return rows[0] || null;
  });
}
