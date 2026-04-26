import { callFnRow, t, tError, DEFAULT_LOCALE } from '@mahallashop/shared';

/**
 * Auth + i18n. Проще чем у seller — не нужно тащить shop в ctx.
 */
export function buildAuthI18n(log) {
  return async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();
    if (!ctx.session) return next();

    const user = await callFnRow('auth.upsert_user', [
      from.id,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      from.language_code || null,
    ]);

    ctx.user = user;
    ctx.session.user_id = user.id;
    ctx.session.language = ctx.session.language || user.language_code || DEFAULT_LOCALE;
    ctx.locale = ctx.session.language;

    if (user.is_blocked) {
      await ctx.reply(t(ctx.locale, 'common.blocked_user'));
      return;
    }

    ctx.t      = (key, vars) => t(ctx.locale, key, vars);
    ctx.tError = (role, code, vars) => tError(ctx.locale, role, code, vars);

    log.debug({ tg_id: from.id, locale: ctx.locale }, 'auth+i18n');
    return next();
  };
}
