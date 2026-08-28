// Главные экспорты пакета @mahallago/shared.
// Подмодули также доступны через subpath imports - см. exports в package.json:
//   import { getPool } from '@mahallago/shared/db';
//   import { t } from '@mahallago/shared/i18n';

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
  optimizeAndSave,
  resolvePhotoPath,
  getPhotoDir,
} from './storage/photos.js';
export {
  verifyInitData,
  DEFAULT_INIT_DATA_TTL_SECONDS,
} from './miniapp/verifyInitData.js';
export {
  sweepStaleConversations,
  clearConversationFromSession,
  expireStaleConversation,
  CONVERSATION_TTL_MS,
} from './sessionHygiene.js';
export { normalizePhone, formatPhone } from './phone.js';
