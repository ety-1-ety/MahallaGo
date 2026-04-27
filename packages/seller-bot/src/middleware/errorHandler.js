import { DomainError, t, clearConversationFromSession } from '@mahallashop/shared';

/**
 * Глобальный обработчик ошибок grammY.
 * DomainError → локализованное сообщение, прочее → системная ошибка.
 *
 * Дополнительно: при любой неожиданной ошибке стираем conversation-blob
 * из session — иначе следующий update пользователя пойдёт в replay
 * битого state и зациклит обработку.
 */
export function errorHandler(log) {
  return async (err) => {
    const ctx = err.ctx;
    const cause = err.error;
    const locale = ctx?.session?.language || ctx?.from?.language_code || 'uz';

    if (cause instanceof DomainError) {
      log.warn({ code: cause.code, detail: cause.detail, update_id: ctx?.update?.update_id }, 'domain error');
      try {
        await ctx.reply(t(locale, 'common.error_unknown'));
      } catch { /* ignore */ }
      return;
    }

    log.error({
      err: cause?.stack || cause?.message || cause,
      update_id: ctx?.update?.update_id,
      from: ctx?.from?.id,
    }, 'unhandled error in handler');

    try {
      await clearConversationFromSession({
        prefix: process.env.REDIS_PREFIX || 'seller:',
        telegramId: ctx?.from?.id,
      });
    } catch (cleanupErr) {
      log.warn({ err: cleanupErr.message }, 'failed to clear conversation blob');
    }

    try {
      await ctx.reply(t(locale, 'common.error_unknown'));
    } catch { /* ignore */ }
  };
}
