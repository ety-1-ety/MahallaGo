import { query } from '@mahallashop/shared';

/**
 * Эндпоинты для страницы /analytics в админке.
 * Графики: рост магазинов, GMV, заказы по часам, топ категорий.
 */
export default async function analyticsRoutes(app) {
  app.get('/analytics/shops-growth', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'Asia/Tashkent')::DATE AS day,
        COUNT(*)::INT AS shops_registered,
        COUNT(*) FILTER (WHERE approved_at IS NOT NULL)::INT AS shops_approved
      FROM shops.shops
      WHERE created_at >= NOW() - INTERVAL '90 days'
      GROUP BY 1
      ORDER BY 1
    `);
    return rows;
  });

  app.get('/analytics/top-categories', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`
      SELECT
        c.id, c.slug, c.name_ru, c.name_uz, c.emoji,
        COUNT(DISTINCT s.id)::INT AS shops,
        COUNT(p.id)::INT          AS products,
        COALESCE(SUM(oi.line_total), 0)::NUMERIC AS revenue
      FROM catalog.categories c
      LEFT JOIN catalog.products p ON p.category_id = c.id
      LEFT JOIN shops.shops      s ON s.id = p.shop_id
      LEFT JOIN orders.order_items oi ON oi.product_id = p.id
      LEFT JOIN orders.orders     o  ON o.id = oi.order_id AND o.status = 'completed'
      WHERE c.is_active = TRUE
      GROUP BY c.id
      ORDER BY revenue DESC, shops DESC
      LIMIT 10
    `);
    return rows;
  });

  app.get('/analytics/active-shops-map', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query(`
      SELECT id, name, category, slug,
             ST_Y(location::GEOMETRY) AS lat,
             ST_X(location::GEOMETRY) AS lng,
             is_accepting_orders
        FROM shops.shops
       WHERE status = 'active'
    `);
    return rows;
  });
}
