import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import crypto from 'node:crypto';

/**
 * JWT + Telegram Login Widget verification.
 *
 * Поток:
 *   1. Frontend получает auth_data от Telegram Login Widget.
 *   2. POST /api/auth/telegram → проверяем hash через bot token,
 *      проверяем что telegram_id есть в ADMIN_TG_IDS env ИЛИ имеет
 *      auth.users.is_admin = true в БД.
 *   3. Выпускаем JWT 24h, кладём в httpOnly cookie.
 *
 * Декораторы:
 *   app.verifyTelegramAuth(authData) — bool
 *   request.requireAuth() — middleware-style guard
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

  // Проверка hash от Telegram Login Widget.
  // Алгоритм:
  //   secret = SHA256(bot_token)
  //   data_check_string = sorted_keys.map(k => `${k}=${value}`).join('\n')  (без 'hash')
  //   expected = HMAC_SHA256(data_check_string, secret).hex()
  //   match expected === auth_data.hash
  //   также проверяем что auth_date не старше 24 часов.
  app.decorate('verifyTelegramAuth', (authData) => {
    if (!authData || typeof authData !== 'object' || !authData.hash) return false;

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return false;

    const { hash, ...rest } = authData;

    const sorted = Object.keys(rest)
      .sort()
      .map((k) => `${k}=${rest[k]}`)
      .join('\n');

    const secret = crypto.createHash('sha256').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex');

    if (computed !== hash) return false;

    // auth_date — unix seconds; принимаем не старше 24 часов
    const authDate = Number(rest.auth_date);
    if (!Number.isFinite(authDate)) return false;
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (ageSec > 24 * 60 * 60) return false;

    return true;
  });

  // Парсинг ADMIN_TG_IDS env
  const adminTgIds = (process.env.ADMIN_TG_IDS || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  app.decorate('adminTgIds', adminTgIds);

  // Guard: требует валидный JWT в cookie. Использовать как preHandler.
  app.decorate('requireAuth', async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch (err) {
      reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });
});
