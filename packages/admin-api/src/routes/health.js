import { getPool, getRedis } from '@mahallashop/shared';

/**
 * GET /health
 * Проверяет соединение с PostgreSQL и Redis. Никаких секретов в ответе.
 */
export default async function healthRoutes(app) {
  app.get('/health', async (request, reply) => {
    const checks = { db: 'unknown', redis: 'unknown' };
    let ok = true;

    try {
      const pool = getPool();
      const { rows } = await pool.query('SELECT 1 AS one');
      checks.db = rows[0]?.one === 1 ? 'ok' : 'fail';
    } catch (err) {
      ok = false;
      checks.db = 'fail';
    }

    try {
      const r = getRedis();
      const pong = await Promise.race([
        r.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch (err) {
      // Не считаем критичным для health: Redis может быть offline в dev
      checks.redis = 'fail';
    }

    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      checks,
    });
  });
}
