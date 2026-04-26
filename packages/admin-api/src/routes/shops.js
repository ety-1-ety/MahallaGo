import { query, callFnRow } from '@mahallashop/shared';
import { notifyShopModeration } from '../services/notifyBots.js';
import { getTelegramPhotoUrl } from '../services/telegramPhoto.js';

/**
 * Все эндпоинты под /api/shops/.
 */
export default async function shopRoutes(app) {
  // Список магазинов с фильтрами/пагинацией
  app.get('/shops', { preHandler: app.requireAuth }, async (request) => {
    const { status, q, page = 1, per_page = 20 } = request.query;
    const params = [];
    const conds  = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}::shops.shop_status`); }
    if (q)      { params.push(`%${q}%`); conds.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const limit = Math.min(Number(per_page) || 20, 100);
    const offset = Math.max((Number(page) || 1) - 1, 0) * limit;

    params.push(limit); params.push(offset);
    const sql = `
      SELECT s.*, ST_Y(s.location::GEOMETRY) AS lat, ST_X(s.location::GEOMETRY) AS lng,
             u.telegram_id AS owner_telegram_id, u.first_name AS owner_first_name, u.username AS owner_username
        FROM shops.shops s
        JOIN auth.users  u ON u.id = s.owner_id
        ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const { rows } = await query(sql, params);

    // total count
    const totalParams = params.slice(0, -2);
    const totalSql = `SELECT COUNT(*)::INT AS total FROM shops.shops s ${where}`;
    const { rows: totalRows } = await query(totalSql, totalParams);

    return { items: rows, total: totalRows[0].total, page: Number(page), per_page: limit };
  });

  // Очередь модерации
  app.get('/shops/pending', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query('SELECT * FROM shops.v_pending_moderation');
    return rows;
  });

  // Детали магазина
  app.get('/shops/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const { rows } = await query('SELECT * FROM shops.v_shop_detail WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // Одобрить
  app.post('/shops/:id/approve', { preHandler: app.requireAuth }, async (request) => {
    const shop = await callFnRow('shops.approve', [request.params.id, request.user.sub]);
    await notifyShopModeration({ shopId: shop.id, action: 'approve' });
    return { shop };
  });

  // Отклонить
  app.post('/shops/:id/reject', { preHandler: app.requireAuth }, async (request, reply) => {
    const reason = request.body?.reason;
    if (!reason || String(reason).trim().length < 2) {
      return reply.code(400).send({ error: 'REJECTION_REASON_REQUIRED' });
    }
    const shop = await callFnRow('shops.reject', [request.params.id, request.user.sub, reason]);
    await notifyShopModeration({ shopId: shop.id, action: 'reject', reason });
    return { shop };
  });

  // Заблокировать
  app.post('/shops/:id/suspend', { preHandler: app.requireAuth }, async (request, reply) => {
    const reason = request.body?.reason;
    if (!reason || String(reason).trim().length < 2) {
      return reply.code(400).send({ error: 'SUSPEND_REASON_REQUIRED' });
    }
    const shop = await callFnRow('shops.suspend', [request.params.id, request.user.sub, reason]);
    await notifyShopModeration({ shopId: shop.id, action: 'suspend', reason });
    return { shop };
  });

  // Прокси для фото магазина (по photo_file_id из таблицы)
  app.get('/shops/:id/photo', { preHandler: app.requireAuth }, async (request, reply) => {
    const { rows } = await query('SELECT photo_file_id FROM shops.shops WHERE id = $1', [request.params.id]);
    const fileId = rows[0]?.photo_file_id;
    if (!fileId) return reply.code(404).send({ error: 'NO_PHOTO' });
    const url = await getTelegramPhotoUrl(fileId);
    if (!url) return reply.code(502).send({ error: 'TELEGRAM_GETFILE_FAILED' });
    return { url };
  });

  // Товары магазина
  app.get('/shops/:id/products', { preHandler: app.requireAuth }, async (request) => {
    const { rows } = await query(`
      SELECT p.*, c.name_ru AS category_name_ru, c.name_uz AS category_name_uz, c.emoji
        FROM catalog.products p
        LEFT JOIN catalog.categories c ON c.id = p.category_id
       WHERE p.shop_id = $1
       ORDER BY p.created_at DESC
    `, [request.params.id]);
    return rows;
  });
}
