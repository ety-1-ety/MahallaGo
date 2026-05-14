import { query } from '@mahallago/shared';

/**
 * Системные настройки. В MVP — список админов и whitelist.
 */
export default async function settingsRoutes(app) {
  app.get('/settings/admins', { preHandler: app.requireAuth }, async () => {
    const { rows } = await query('SELECT * FROM auth.v_admins');
    return rows;
  });

  app.get('/settings/whitelist', { preHandler: app.requireAuth }, async () => {
    return { admin_tg_ids: app.adminTgIds };
  });
}
