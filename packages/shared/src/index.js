// Главные экспорты пакета @mahallashop/shared.
// Подмодули также доступны через subpath imports — см. exports в package.json:
//   import { getPool } from '@mahallashop/shared/db';
//   import { t } from '@mahallashop/shared/i18n';

export * from './db/index.js';
export { getRedis, getRedisSubscriber, closeRedis } from './redis/client.js';
export { t, tError, tOrderStatus, hasKey, SUPPORTED_LOCALES, DEFAULT_LOCALE, defaultLocale } from './i18n/loader.js';
export { createLogger } from './logger.js';
export { loadConfig, ConfigError } from './config.js';
export { DomainError, fromPgError, isDomainErrorCode, ORDER_ERRORS, COMMON_ERRORS } from './errors.js';
export {
  DEFAULT_TZ,
  formatDateTime,
  formatTime,
  dayKeyAt,
  timeOfDayAt,
  isShopOpenNow,
  closeTimeToday,
  formatUZS,
} from './time.js';
export {
  downloadTelegramPhoto,
  resolvePhotoPath,
  getPhotoDir,
} from './storage/photos.js';
