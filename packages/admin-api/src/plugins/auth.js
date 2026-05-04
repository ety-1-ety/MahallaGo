import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';

/**
 * JWT + cookie-based admin auth.
 *
 * Поток:
 *   1. POST /api/auth/login (login + password) → выдаём JWT 24h в httpOnly cookie.
 *   2. Все защищённые endpoint'ы используют preHandler: app.requireAuth.
 *
 * Декоратор: app.requireAuth — middleware, проверяющий JWT в cookie.
 */
export default fp(async (app) => {
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'dev-cookie-secret',
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me-please-32-bytes-min',
    cookie: {
      cookieName: process.env.COOKIE_NAME || 'mhs_admin',
      signed: false,
    },
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '24h' },
  });

  // Guard: требует валидный JWT в cookie. Использовать как preHandler.
  app.decorate('requireAuth', async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch (err) {
      reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });
});
