import { DomainError, t, ORDER_ERRORS, clearConversationFromSession } from '@mahallashop/shared';

/**
 * Глобальный обработчик ошибок для buyer-bot.
 * Если ошибка из orders.create_order — она уже обрабатывается в handler
 * checkout с локализованным сообщением. Сюда попадают только неожиданные.
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
      log.warn({ code: cause.code, detail: cause.detail }, 'domain error reached top-level');
      try {
        // Пытаемся найти локализованное сообщение, иначе общая ошибка
        const orderErr = Object.values(ORDER_ERRORS).includes(cause.code)
          ? t(locale, `buyer.errors.${cause.code}`)
          : t(locale, 'common.error_unknown');
        await ctx.reply(orderErr);
      } catch { /* ignore */ }
      return;
    }

    log.error({
      err: cause?.stack || cause?.message || cause,
      update_id: ctx?.update?.update_id,
      from: ctx?.from?.id,
    }, 'unhandled error in handler');

    // Стираем conversation-blob, если ошибка случилась в процессе flow.
    // Без этого следующий update пользователя замёрз бы в replay сломанного state.
    try {
      await clearConversationFromSession({
        prefix: process.env.REDIS_PREFIX || 'buyer:',
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
