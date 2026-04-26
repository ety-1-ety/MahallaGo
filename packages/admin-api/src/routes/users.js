import { query, callFnRow } from '@mahallashop/shared';

export default async function userRoutes(app) {
  app.get('/users', { preHandler: app.requireAuth }, async (request) => {
    const { q, page = 1, per_page = 50 } = request.query;
    const params = [];
    const conds  = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(first_name ILIKE $${params.length} OR username ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const limit  = Math.min(Number(per_page) || 50, 200);
    const offset = Math.max((Number(page) || 1) - 1, 0) * limit;
    params.push(limit); params.push(offset);

    const { rows } = await query(`
      SELECT id, telegram_id, username, first_name, last_name, phone,
             language_code, is_admin, is_blocked, last_seen_at, created_at
        FROM auth.users
        ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return { items: rows };
  });

  // Дать/забрать админ-права (только для существующих админов)
  app.post('/users/:tg_id/mark-admin', { preHandler: app.requireAuth }, async (request) => {
    const tgId = Number(request.params.tg_id);
    const value = Boolean(request.body?.is_admin ?? true);
    const user = await callFnRow('auth.mark_as_admin', [tgId, value]);
    return { user };
  });
}
