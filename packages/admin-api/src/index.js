import 'dotenv/config';
import Fastify from 'fastify';
import { createLogger, loadConfig, closePool, closeRedis } from '@mahallago/shared';

import corsPlugin       from './plugins/cors.js';
import authPlugin       from './plugins/auth.js';
import miniappAuthPlugin from './plugins/miniappAuth.js';
import errorPlugin      from './plugins/errorHandler.js';

import healthRoutes     from './routes/health.js';
import authRoutes       from './routes/auth.js';
import dashboardRoutes  from './routes/dashboard.js';
import shopRoutes       from './routes/shops.js';
import orderRoutes      from './routes/orders.js';
import userRoutes       from './routes/users.js';
import analyticsRoutes  from './routes/analytics.js';
import settingsRoutes   from './routes/settings.js';
import miniappBuyerRoutes  from './routes/miniappBuyer.js';
import miniappSellerRoutes from './routes/miniappSeller.js';

const log = createLogger('admin-api');

const cfg = loadConfig({
  required: ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
  optional: {
    PORT: '3000',
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    BOT_TOKEN: '',
    BOT_USERNAME: '',
    ADMIN_TG_IDS: '',
    JWT_EXPIRES_IN: '24h',
    COOKIE_NAME: 'mgo_admin',
    COOKIE_DOMAIN: '',
    COOKIE_SECURE: 'false',
    CORS_ORIGIN: 'http://localhost:4200',
    REDIS_CHANNEL_NEW_ORDER:  'orders:new',
    REDIS_CHANNEL_MODERATION: 'shops:moderation',
  },
  numbers: ['PORT'],
});

const app = Fastify({
  loggerInstance: log,
  trustProxy: true,
  bodyLimit: 1 * 1024 * 1024,  // 1MB — фото грузятся через бот, тут только JSON
});

// Plugins (порядок важен: cookie/jwt из authPlugin переиспользуется miniappAuth'ом)
await app.register(corsPlugin);
await app.register(authPlugin);
await app.register(miniappAuthPlugin);
await app.register(errorPlugin);

// Health не требует /api префикса — бывает удобно для liveness probe
await app.register(healthRoutes);

// Все API-маршруты под /api
await app.register(async (api) => {
  await api.register(authRoutes);
  await api.register(dashboardRoutes);
  await api.register(shopRoutes);
  await api.register(orderRoutes);
  await api.register(userRoutes);
  await api.register(analyticsRoutes);
  await api.register(settingsRoutes);

  // Mini App routes — отдельные namespace'ы под `/api/miniapp/buyer/*`
  // и `/api/miniapp/seller/*`. multipart регистрируем ТОЛЬКО на seller'е
  // (Стадия 4), сейчас оба — JSON.
  await api.register(async (mini) => {
    await mini.register(miniappBuyerRoutes,  { prefix: '/buyer'  });
    await mini.register(miniappSellerRoutes, { prefix: '/seller' });
  }, { prefix: '/miniapp' });
}, { prefix: '/api' });

// Graceful shutdown
async function shutdown(signal) {
  log.info({ signal }, 'shutting down');
  try { await app.close();   } catch (err) { log.warn({ err: err.message }, 'fastify close'); }
  try { await closeRedis();  } catch (err) { log.warn({ err: err.message }, 'closeRedis'); }
  try { await closePool();   } catch (err) { log.warn({ err: err.message }, 'closePool'); }
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  log.info({ port: cfg.PORT, host: cfg.HOST }, '✔ admin-api started');
} catch (err) {
  log.error({ err: err.stack || err.message }, 'failed to start');
  process.exit(1);
}
