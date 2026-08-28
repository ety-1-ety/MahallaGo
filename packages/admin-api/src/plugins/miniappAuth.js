import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';

// Telegram Mini App · auth plugin
//
// Параллельно с существующим admin-auth (login/password → cookie mgo_admin)
// поднимаем ДВЕ независимые JWT-namespace'а для Mini App'ов:
//   - buyer:  cookie `MINIAPP_COOKIE_NAME_BUYER` (default 'mgo_mini_b')
//             path: '/api/miniapp/buyer'
//   - seller: cookie `MINIAPP_COOKIE_NAME_SELLER` (default 'mgo_mini_s')
//             path: '/api/miniapp/seller'
//
// JWT payload:
//   { uid: <auth.users.id UUID>, tg: <telegram_id>, role: 'buyer'|'seller',
//     shop_id?: <UUID> (только для seller) }
//
// Decorators:
//   - app.requireBuyer  - preHandler, проверяет cookie mgo_mini_b → request.miniappUser
//   - app.requireSeller - preHandler, проверяет cookie mgo_mini_s → request.miniappUser, request.miniappShop
//   - app.signMiniappToken({ payload, role }) - выдаёт JWT для cookie
//   - app.miniappCookieName(role) - резолвит имя cookie по роли
//   - app.miniappCookieOptions(role) - общие опции (httpOnly, secure, sameSite, path, maxAge)
//
// ВАЖНО: основной admin-auth (auth.js) уже регистрирует @fastify/cookie и
// @fastify/jwt с namespace 'jwt' и cookie 'mgo_admin'. Чтобы не конфликтовать,
// здесь регистрируем JWT под именем 'miniappJwt' (через `namespace`).

export default fp(async (app) => {
  // cookie plugin уже зарегистрирован в auth.js, повторно не регистрируем
  // (fastify-plugin защищён от повторной регистрации, но cookie теперь общий).

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me-please-32-bytes-min',
    namespace: 'miniapp',  // даёт app.jwt.miniapp.sign() / request.miniappJwtVerify()
    // cookie-настройка здесь не указываем - извлекаем cookie вручную в preHandler,
    // потому что нам нужны РАЗНЫЕ имена cookie на разные роли.
    sign: { expiresIn: process.env.MINIAPP_JWT_EXPIRES_IN || '24h' },
  });

  const COOKIE_BUYER  = process.env.MINIAPP_COOKIE_NAME_BUYER  || 'mgo_mini_b';
  const COOKIE_SELLER = process.env.MINIAPP_COOKIE_NAME_SELLER || 'mgo_mini_s';
  const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
  const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
  const MAX_AGE_SEC   = 24 * 60 * 60;

  function cookieNameFor(role) {
    return role === 'seller' ? COOKIE_SELLER : COOKIE_BUYER;
  }

  function cookieOptionsFor(role) {
    return {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      path: role === 'seller' ? '/api/miniapp/seller' : '/api/miniapp/buyer',
      domain: COOKIE_DOMAIN,
      maxAge: MAX_AGE_SEC,
    };
  }

  app.decorate('miniappCookieName',    cookieNameFor);
  app.decorate('miniappCookieOptions', cookieOptionsFor);

  // Помощник для подписи токена.
  // role обязателен, payload может содержать uid/tg/shop_id.
  app.decorate('signMiniappToken', function signMiniappToken({ payload, role }) {
    if (!role) throw new Error('signMiniappToken: role required');
    return app.jwt.miniapp.sign({ ...payload, role });
  });

  // - Guards -
  app.decorate('requireBuyer',  buildGuard('buyer'));
  app.decorate('requireSeller', buildGuard('seller'));

  function buildGuard(role) {
    const cookieName = cookieNameFor(role);
    return async function guard(request, reply) {
      const token = request.cookies?.[cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', detail: 'no cookie' });
      }
      let payload;
      try {
        payload = await app.jwt.miniapp.verify(token);
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED', detail: 'invalid jwt' });
      }
      if (payload.role !== role) {
        return reply.code(403).send({ error: 'FORBIDDEN', detail: 'role mismatch' });
      }
      request.miniappUser = { id: payload.uid, telegram_id: payload.tg, role };
      if (role === 'seller') {
        request.miniappShop = { id: payload.shop_id };
      }
    };
  }
});
