// Загрузить базовые данные (категории, начальный админ).
// Использует DATABASE_URL из корневого .env.
//
// Запуск:  node scripts/seed.js
//          pnpm seed

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { seed } from '../db/_runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbDir      = path.resolve(__dirname, '..', 'db');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ DATABASE_URL не задан. Скопируйте .env.example в .env и заполните.');
  process.exit(1);
}

try {
  await seed({ databaseUrl, dbDir });
  process.exit(0);
} catch (err) {
  console.error('✖ seed failed:', err.message);
  process.exit(1);
}
