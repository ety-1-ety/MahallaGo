// ─────────────────────────────────────────────────────────────────
// Логгер pino. В development использует pino-pretty для читабельного
// вывода. В production пишет JSON-строки для агрегации.
//
// Использование:
//   import { createLogger } from '@mahallashop/shared/logger';
//   const log = createLogger('buyer-bot');
//   log.info({ user_id }, 'user started');
// ─────────────────────────────────────────────────────────────────

import pino from 'pino';

export function createLogger(name, opts = {}) {
  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

  const baseOpts = {
    name,
    level,
    base: { service: name, pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...opts,
  };

  if (isDev) {
    return pino({
      ...baseOpts,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service',
          singleLine: false,
        },
      },
    });
  }

  return pino(baseOpts);
}
