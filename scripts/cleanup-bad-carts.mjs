// ─────────────────────────────────────────────────────────────────
// Одноразовый скрипт: подчистить корзины покупателей в Redis от
// product_id'ов, которых больше нет в БД (или is_active=false).
//
// Стало необходимо после dedupe-скрипта, который физически удалил
// дубликаты товаров — UUID этих рядов могли остаться в session.cart
// у покупателей, и checkout падал бы с ITEM_NOT_AVAILABLE.
//
// Запуск:
//   node scripts/cleanup-bad-carts.mjs
//
// Идемпотентен: можно вызывать несколько раз.
// ─────────────────────────────────────────────────────────────────

import 'dotenv/config';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
// ioredis резолвится из node_modules пакета shared (там это прямая зависимость).
// Node ESM ищет модули относительно файла, который их импортирует — поэтому
// импортируем shared/redis/client.js, а внутри него `import Redis from 'ioredis'`
// уже найдётся в packages/shared/node_modules.
const { default: IoRedis } = await import('../packages/shared/node_modules/ioredis/built/index.js');
const Redis = IoRedis;

// Подхватим .env из buyer-bot пакета (там REDIS_URL и REDIS_PREFIX).
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '..', 'packages', 'buyer-bot', '.env');
try {
  const text = await fs.readFile(envFile, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env может отсутствовать; используем то что есть в окружении */ }

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:CHANGE_ME@localhost:5432/mahallago_dev';
const redisUrl    = process.env.REDIS_URL    || 'redis://localhost:6379/1';
const prefix      = process.env.REDIS_PREFIX || 'buyer:';

const pool  = new pg.Pool({ connectionString: databaseUrl });
const redis = new Redis(redisUrl);

// ioredis-клиент бота использует keyPrefix=`${prefix}` (см. shared/redis/client.js),
// поэтому реальные ключи в Redis выглядят как `<prefix><prefix>sess:<id>`
// (двойной prefix). Ищем оба варианта чтобы быть устойчивыми и к запуску
// со своим keyPrefix, и без.
const sessKeysSet = new Set([
  ...(await redis.keys(`${prefix}sess:*`)),
  ...(await redis.keys(`${prefix}${prefix}sess:*`)),
]);
const sessKeys = Array.from(sessKeysSet);
console.log(`Найдено сессий: ${sessKeys.length}`);

let cleaned = 0;
let totalRemoved = 0;
for (const key of sessKeys) {
  const raw = await redis.get(key);
  if (!raw) continue;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    continue;
  }
  const items = parsed.cart?.items;
  if (!Array.isArray(items) || items.length === 0) continue;

  const ids = items.map((i) => i.product_id).filter(Boolean);
  if (ids.length === 0) continue;

  const { rows } = await pool.query(
    'SELECT id FROM catalog.products WHERE id = ANY($1::uuid[]) AND is_active = TRUE',
    [ids],
  );
  const validIds = new Set(rows.map((r) => r.id));

  const newItems = items.filter((i) => validIds.has(i.product_id));
  const removedCount = items.length - newItems.length;
  if (removedCount === 0) continue;

  parsed.cart.items = newItems;
  if (newItems.length === 0) parsed.cart.shop_id = null;

  await redis.set(key, JSON.stringify(parsed), 'EX', 60 * 60 * 24 * 30);
  console.log(`  ✓ ${key}: убрано ${removedCount} (осталось ${newItems.length})`);
  cleaned++;
  totalRemoved += removedCount;
}

console.log(`\nИтог: ${cleaned} сессий очищено, ${totalRemoved} stale-позиций удалено`);
await redis.quit();
await pool.end();
