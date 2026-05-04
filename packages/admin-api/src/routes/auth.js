import bcrypt from 'bcrypt';

/**
 * POST /api/auth/login   — username + password
 * POST /api/auth/logout  — стирает cookie
 * GET  /api/auth/me      — возвращает текущего админа
 *
 * Хранение для одного админа: ADMIN_USERNAME + ADMIN_PASSWORD_HASH в .env
 * (bcrypt hash). Когда понадобится несколько админов — переезд на таблицу.
 */
export default async function authRoutes(app) {
  app.post('/auth/login', async (request, reply) => {
    const { login, password } = request.body || {};
    if (typeof login !== 'string' || typeof password !== 'string') {
      return reply.code(400).send({ error: 'INVALID_BODY' });
    }

    const expectedLogin = process.env.ADMIN_USERNAME;
    const expectedHash  = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedLogin || !expectedHash) {
      app.log.error('ADMIN_USERNAME or ADMIN_PASSWORD_HASH not configured');
      return reply.code(500).send({ error: 'AUTH_NOT_CONFIGURED' });
    }

    if (login !== expectedLogin) {
      // Чтобы тайминг-атаки не различали "нет такого юзера" от "пароль неверный",
      // всё равно вызываем bcrypt.compare с фиктивным значением.
      await bcrypt.compare(password, '$2b$12$' + 'a'.repeat(53));
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    const ok = await bcrypt.compare(password, expectedHash);
    if (!ok) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    const token = app.jwt.sign({ sub: login, name: login });

    const cookieName = process.env.COOKIE_NAME || 'mhs_admin';
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
      domain: process.env.COOKIE_DOMAIN || undefined,
      maxAge: 24 * 60 * 60,
    });

    return { user: { login, name: login } };
  });

  app.post('/auth/logout', async (request, reply) => {
    const cookieName = process.env.COOKIE_NAME || 'mhs_admin';
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.requireAuth }, async (request) => {
    const payload = request.user;
    return { login: payload.sub, name: payload.name };
  });
}
