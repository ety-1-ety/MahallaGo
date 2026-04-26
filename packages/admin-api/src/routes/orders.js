import { query } from '@mahallashop/shared';

export default async function orderRoutes(app) {
  // Список заказов с фильтрами. status может быть либо одним значением,
  // либо списком через запятую (например "pending,accepted,ready").
  app.get('/orders', { preHandler: app.requireAuth }, async (request) => {
    const { status, shop_id, page = 1, per_page = 20 } = request.query;
    const params = [];
    const conds  = [];
    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        conds.push(`status = $${params.length}::orders.order_status`);
      } else if (statuses.length > 1) {
        params.push(statuses);
        conds.push(`status = ANY($${params.length}::orders.order_status[])`);
      }
    }
    if (shop_id) { params.push(shop_id); conds.push(`shop_id = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const limit  = Math.min(Number(per_page) || 20, 100);
    const offset = Math.max((Number(page) || 1) - 1, 0) * limit;

    params.push(limit); params.push(offset);
    const { rows } = await query(`
      SELECT * FROM orders.v_orders_full
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: totalRows } = await query(
      `SELECT COUNT(*)::INT AS total FROM orders.orders ${where}`,
      params.slice(0, -2),
    );

    return { items: rows, total: totalRows[0].total, page: Number(page), per_page: limit };
  });

  // Детали заказа: header + items + timeline
  app.get('/orders/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const { rows } = await query('SELECT * FROM orders.v_orders_full WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'NOT_FOUND' });

    const [items, timeline] = await Promise.all([
      query('SELECT * FROM orders.order_items WHERE order_id = $1 ORDER BY created_at', [request.params.id]),
      query('SELECT * FROM orders.v_status_timeline WHERE order_id = $1', [request.params.id]),
    ]);

    return { order: rows[0], items: items.rows, timeline: timeline.rows };
  });
}
