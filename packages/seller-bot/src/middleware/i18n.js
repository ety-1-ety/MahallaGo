import { callFnRow, query, t, tError, DEFAULT_LOCALE, expireStaleConversation } from '@mahallashop/shared';

/**
 * Auth + i18n middleware:
 *   1. Создаёт/обновляет auth.users по telegram_id (auth.upsert_user).
 *   2. Загружает активный магазин продавца (если есть) в session.shop_id.
 *   3. Кладёт ctx.user, ctx.shop, ctx.locale, ctx.t, ctx.tError для удобства.
 */
export function buildAuthI18n(log) {
  return async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();

    if (!ctx.session) {
      // session middleware ещё не отработал — это означает что мы в conversations re-entry
      // или запрос без session-key. Пропускаем без auth.
      return next();
    }

    // Если у пользователя залежался conversation-blob (>30 мин с момента
    // последнего шага) — стираем ПЕРЕД conversations(), чтобы он не пытался
    // replay'ить протухший state. Следующий update пойдёт по нормальному
    // /start-flow без зависания на старом шаге.
    if (expireStaleConversation(ctx.session)) {
      log.info({ tg_id: from.id }, 'expired stale conversation blob');
    }

    // Upsert пользователя в auth.users
    const user = await callFnRow('auth.upsert_user', [
      from.id,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      from.language_code || null,
    ]);

    ctx.user = user;
    ctx.session.user_id = user.id;
    ctx.session.language = user.language_code || ctx.session.language || DEFAULT_LOCALE;
    ctx.locale = ctx.session.language;

    if (user.is_blocked) {
      await ctx.reply(t(ctx.locale, 'common.blocked_user'));
      return;  // пресекаем дальнейшую обработку
    }

    // Подгружаем активный магазин продавца (берём первый по created_at).
    // В MVP один владелец = один магазин, но в БД допускается несколько —
    // пусть будет поведение «текущий = последний созданный».
    if (!ctx.session.shop_id) {
      const { rows } = await query(
        'SELECT id FROM shops.shops WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id],
      );
      ctx.session.shop_id = rows[0]?.id || null;
    }

    if (ctx.session.shop_id) {
      const { rows } = await query(
        'SELECT * FROM shops.shops WHERE id = $1',
        [ctx.session.shop_id],
      );
      ctx.shop = rows[0] || null;
    } else {
      ctx.shop = null;
    }

    // Удобные хелперы локализации в контексте
    ctx.t      = (key, vars) => t(ctx.locale, key, vars);
    ctx.tError = (role, code, vars) => tError(ctx.locale, role, code, vars);

    log.debug({
      tg_id: from.id,
      user_id: user.id,
      shop_id: ctx.session.shop_id,
      locale: ctx.locale,
    }, 'auth+i18n');

    return next();
  };
}
