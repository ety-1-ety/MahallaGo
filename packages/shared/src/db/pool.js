// ─────────────────────────────────────────────────────────────────
// pg.Pool factory — singleton-пул на процесс.
//
// Использование:
//   import { getPool } from '@mahallago/shared/db';
//   const pool = getPool();
//   const { rows } = await pool.query('SELECT 1');
//
// Закрытие при graceful shutdown:
//   await closePool();
// ─────────────────────────────────────────────────────────────────

import pg from 'pg';

let _pool = null;

export function getPool(connectionString) {
  if (_pool) return _pool;

  const cs = connectionString || process.env.DATABASE_URL;
  if (!cs) {
    throw new Error('DATABASE_URL не задан. Невозможно создать pg.Pool');
  }

  _pool = new pg.Pool({
    connectionString: cs,
    // Разумные дефолты для VPS#2 → VPS#1 через приватную сеть
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err) => {
    // не падаем — pg.Pool сам переподнимет соединение
    // eslint-disable-next-line no-console
    console.error('[pg.Pool] idle client error:', err.message);
  });

  return _pool;
}

export async function closePool() {
  if (!_pool) return;
  const p = _pool;
  _pool = null;
  await p.end();
}

/**
 * Транзакция с автоматическим BEGIN/COMMIT/ROLLBACK.
 * Использование:
 *   await withTx(async (client) => {
 *     await client.query('UPDATE ...');
 *     await client.query('INSERT ...');
 *   });
 */
export async function withTx(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}
