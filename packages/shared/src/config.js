// Универсальный загрузчик env с ручной валидацией.
//
// Использование:
//   import { loadConfig } from '@mahallago/shared/config';
//
//   const cfg = loadConfig({
//     required: ['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'],
//     optional: { LOG_LEVEL: 'info', NODE_ENV: 'development' },
//     numbers:  ['RATE_LIMIT_PER_SEC', 'PORT'],
//   });
//
// dotenv.config() уже должен быть вызван в entry-файле пакета
// (через `import 'dotenv/config'` или явно).

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(spec = {}) {
  const required = spec.required || [];
  const optional = spec.optional || {};
  const numbers  = spec.numbers  || [];
  const booleans = spec.booleans || [];

  const result = {};
  const missing = [];

  for (const key of required) {
    const v = process.env[key];
    if (v === undefined || v === '') {
      missing.push(key);
    } else {
      result[key] = v;
    }
  }

  for (const [key, defaultValue] of Object.entries(optional)) {
    const v = process.env[key];
    result[key] = (v === undefined || v === '') ? defaultValue : v;
  }

  if (missing.length > 0) {
    throw new ConfigError(
      `Отсутствуют обязательные переменные окружения: ${missing.join(', ')}. ` +
      `Скопируйте .env.example в .env и заполните значения.`,
    );
  }

  for (const key of numbers) {
    if (result[key] === undefined) continue;
    const n = Number(result[key]);
    if (!Number.isFinite(n)) {
      throw new ConfigError(`Переменная ${key} должна быть числом, получено: ${result[key]}`);
    }
    result[key] = n;
  }

  for (const key of booleans) {
    if (result[key] === undefined) continue;
    const v = String(result[key]).toLowerCase();
    result[key] = v === 'true' || v === '1' || v === 'yes';
  }

  return result;
}
