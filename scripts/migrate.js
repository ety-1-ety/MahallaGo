// Применить все миграции БД (extensions + модули).
// Использует DATABASE_URL из корневого .env.
//
// Запуск:  node scripts/migrate.js
//          pnpm migrate

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { migrate } from '../db/_runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbDir      = path.resolve(__dirname, '..', 'db');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ DATABASE_URL не задан. Скопируйте .env.example в .env и заполните.');
  process.exit(1);
}

try {
  await migrate({ databaseUrl, dbDir });
  process.exit(0);
} catch (err) {
  console.error('✖ migration failed:', err.message);
  process.exit(1);
}
