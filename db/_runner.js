// ─────────────────────────────────────────────────────────────────
// Migration Runner
//
// Применяет SQL-миграции в правильном порядке:
//   1. db/extensions.sql
//   2. db/modules/<module>/<NNN>_*.sql  (модули в фиксированном порядке)
//   3. (по запросу) db/seeds/*.sql
//
// Учёт применённых файлов в таблице public._migrations для идемпотентности.
//
// Используется через scripts/migrate.js, scripts/seed.js,
// scripts/refresh-functions.js.
// ─────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Порядок применения модулей фиксирован: auth → shops → catalog → orders → delivery
// (delivery — placeholder, может не содержать .sql)
const MODULE_ORDER = ['auth', 'shops', 'catalog', 'orders', 'delivery'];

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public._migrations (
    id            SERIAL       PRIMARY KEY,
    name          TEXT         NOT NULL UNIQUE,
    checksum      TEXT         NOT NULL,
    applied_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`;

function checksumOf(content) {
  // Простой быстрый чексум: длина + хеш Java-стиля. Достаточно для трекинга
  // изменений (мы не используем его для верификации безопасности).
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return `${content.length}:${(h >>> 0).toString(16)}`;
}

async function readSqlFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw;
}

async function listModuleFiles(dbDir, moduleName) {
  const moduleDir = path.join(dbDir, 'modules', moduleName);
  let entries;
  try {
    entries = await fs.readdir(moduleDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => path.join(moduleDir, e.name))
    .sort();  // 001_*, 002_*, 003_*, 004_*
}

async function listSeedFiles(dbDir) {
  const seedsDir = path.join(dbDir, 'seeds');
  let entries;
  try {
    entries = await fs.readdir(seedsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => path.join(seedsDir, e.name))
    .sort();
}

async function alreadyApplied(client, name, checksum) {
  const { rows } = await client.query(
    'SELECT checksum FROM public._migrations WHERE name = $1',
    [name],
  );
  if (rows.length === 0) return { applied: false };
  if (rows[0].checksum !== checksum) {
    return { applied: true, drifted: true, prevChecksum: rows[0].checksum };
  }
  return { applied: true, drifted: false };
}

async function applyFile(client, name, content, log) {
  const checksum = checksumOf(content);
  const status = await alreadyApplied(client, name, checksum);

  if (status.applied && !status.drifted) {
    log(`  ✓ skip   ${name}  (already applied)`);
    return { skipped: true };
  }

  if (status.applied && status.drifted) {
    log(`  ↻ re-run ${name}  (content changed: ${status.prevChecksum} → ${checksum})`);
  } else {
    log(`  + apply  ${name}`);
  }

  await client.query('BEGIN');
  try {
    await client.query(content);
    await client.query(
      `INSERT INTO public._migrations (name, checksum)
         VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE
         SET checksum = EXCLUDED.checksum,
             applied_at = NOW()`,
      [name, checksum],
    );
    await client.query('COMMIT');
    return { skipped: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Migration ${name} failed: ${err.message}`);
  }
}

/**
 * Применить базовые миграции: extensions + все модули.
 * @param {Object} opts
 * @param {string} opts.databaseUrl    — DATABASE_URL
 * @param {string} [opts.dbDir]        — путь к папке db/ (по умолчанию рядом)
 * @param {(msg: string) => void} [opts.log]
 */
export async function migrate({ databaseUrl, dbDir, log = console.log } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const baseDir = dbDir || __dirname;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(MIGRATIONS_TABLE_SQL);

    log('▶ extensions.sql');
    const extPath = path.join(baseDir, 'extensions.sql');
    const extSql  = await readSqlFile(extPath);
    await applyFile(client, 'extensions.sql', extSql, log);

    for (const moduleName of MODULE_ORDER) {
      const files = await listModuleFiles(baseDir, moduleName);
      if (files.length === 0) {
        log(`▶ modules/${moduleName}/  (нет .sql, пропускаю)`);
        continue;
      }
      log(`▶ modules/${moduleName}/`);
      for (const file of files) {
        const rel  = `modules/${moduleName}/${path.basename(file)}`;
        const sql  = await readSqlFile(file);
        await applyFile(client, rel, sql, log);
      }
    }

    log('✔ migrations done');
  } finally {
    await client.end();
  }
}

/**
 * Применить seed-файлы. Идемпотентно через тот же _migrations журнал.
 */
export async function seed({ databaseUrl, dbDir, log = console.log } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const baseDir = dbDir || __dirname;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(MIGRATIONS_TABLE_SQL);

    const files = await listSeedFiles(baseDir);
    if (files.length === 0) {
      log('▶ seeds/  (нет .sql, нечего загружать)');
      return;
    }

    log('▶ seeds/');
    for (const file of files) {
      const rel = `seeds/${path.basename(file)}`;
      const sql = await readSqlFile(file);
      await applyFile(client, rel, sql, log);
    }

    log('✔ seeds done');
  } finally {
    await client.end();
  }
}

/**
 * Переприменить только функции (002_functions.sql) всех модулей.
 * Удобно при разработке: позволяет менять логику функций без новой миграции.
 */
export async function refreshFunctions({ databaseUrl, dbDir, log = console.log } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const baseDir = dbDir || __dirname;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    log('▶ refresh functions');
    for (const moduleName of MODULE_ORDER) {
      const filePath = path.join(baseDir, 'modules', moduleName, '002_functions.sql');
      try {
        const sql = await readSqlFile(filePath);
        log(`  ↻ modules/${moduleName}/002_functions.sql`);
        await client.query(sql);
        // Обновим чексум в журнале, чтобы потом migrate не считал что изменилось
        const checksum = checksumOf(sql);
        await client.query(
          `INSERT INTO public._migrations (name, checksum)
             VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE
             SET checksum = EXCLUDED.checksum,
                 applied_at = NOW()`,
          [`modules/${moduleName}/002_functions.sql`, checksum],
        );
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
    }
    log('✔ functions refreshed');
  } finally {
    await client.end();
  }
}
