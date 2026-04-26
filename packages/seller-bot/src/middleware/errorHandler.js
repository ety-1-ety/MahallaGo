import { DomainError, t } from '@mahallashop/shared';

/**
 * Глобальный обработчик ошибок grammY.
 * DomainError → локализованное сообщение, прочее → системная ошибка.
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
      await ctx.reply(t(locale, 'common.error_unknown'));
    } catch { /* ignore */ }
  };
}
