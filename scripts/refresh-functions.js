// Переприменить только 002_functions.sql всех модулей.
// Удобно для итеративной разработки логики функций без новой миграции.
//
// Запуск:  node scripts/refresh-functions.js
//          pnpm refresh-functions

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { refreshFunctions } from '../db/_runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbDir      = path.resolve(__dirname, '..', 'db');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ DATABASE_URL не задан. Скопируйте .env.example в .env и заполните.');
  process.exit(1);
}

try {
  await refreshFunctions({ databaseUrl, dbDir });
  process.exit(0);
} catch (err) {
  console.error('✖ refresh-functions failed:', err.message);
  process.exit(1);
}
