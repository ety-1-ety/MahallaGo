import { query } from '@mahallashop/shared';

/**
 * GET /api/dashboard/kpis
 * Сводные KPI для главной страницы админки.
 */
export default async function dashboardRoutes(app) {
  app.get('/dashboard/kpis', { preHandler: app.requireAuth }, async () => {
    const [shopsRes, ordersRes, gmvRes, usersRes] = await Promise.all([
      query(`SELECT
               COUNT(*) FILTER (WHERE status = 'active')           AS active,
               COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending,
               COUNT(*) FILTER (WHERE status = 'suspended')        AS suspended,
               COUNT(*) FILTER (WHERE status = 'rejected')         AS rejected
             FROM shops.shops`),
      query(`SELECT
               COUNT(*) FILTER (WHERE status IN ('pending','accepted','ready','delivering')) AS active,
               COUNT(*) FILTER (WHERE status = 'completed')                                  AS completed,
               COUNT(*) FILTER (WHERE status IN ('rejected','cancelled'))                    AS cancelled,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('day',  NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent') AS today,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent') AS this_week
             FROM orders.orders`),
      query(`SELECT
               COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('day',  NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'), 0) AS today,
               COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('month',NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'), 0) AS this_month
             FROM orders.orders`),
      query(`SELECT COUNT(*) AS total FROM auth.users`),
    ]);

    return {
      shops:  shopsRes.rows[0],
      orders: ordersRes.rows[0],
      gmv:    gmvRes.rows[0],
      users:  usersRes.rows[0],
    };
  });

  app.get('/dashboard/orders-by-hour', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`
      SELECT
        EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Tashkent'))::INT AS hour,
        COUNT(*)::INT AS count
      FROM orders.orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY 1
    `);
    return rows;
  });

  app.get('/dashboard/gmv-trend', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'Asia/Tashkent')::DATE AS day,
        COALESCE(SUM(total), 0)::NUMERIC AS gmv
      FROM orders.orders
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);
    return rows;
  });
}
