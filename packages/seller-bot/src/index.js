import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import {
  createLogger, loadConfig, closePool, closeRedis,
  sweepStaleConversations, clearConversationFromSession,
  callFnRow, t as tFn,
} from '@mahallashop/shared';

import { buildSession }   from './middleware/session.js';
import { buildAuthI18n }  from './middleware/i18n.js';
import { buildRateLimit } from './middleware/rateLimit.js';
import { errorHandler }   from './middleware/errorHandler.js';
import { statusGuard }    from './middleware/statusGuard.js';

import { onboarding }     from './conversations/onboarding.js';
import { addProduct }     from './conversations/addProduct.js';
import { editSetting }    from './conversations/editSetting.js';
import { editProduct }    from './conversations/editProduct.js';

import { registerStart }  from './handlers/start.js';
import { handleMainMenuMessage } from './handlers/menu.js';
import { handleOrderCallback, handleRejectReason } from './handlers/orders.js';
import { applySettingUpdate } from './handlers/settings.js';
import { settingsKeyboard } from './keyboards/settings.js';
import { handleProductMgrCallback } from './handlers/myProducts.js';

import { startNotifier } from './notifier.js';

const log = createLogger('seller-bot');

const cfg = loadConfig({
  required: ['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'],
  optional: {
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    REDIS_PREFIX: 'seller:',
    REDIS_CHANNEL_NEW_ORDER:  'orders:new',
    REDIS_CHANNEL_MODERATION: 'shops:moderation',
    RATE_LIMIT_PER_SEC: 10,
  },
  numbers: ['RATE_LIMIT_PER_SEC'],
});

const bot = new Bot(cfg.BOT_TOKEN);

// ─── Middleware (порядок важен) ────────────────────────────────────
bot.use(buildSession());
bot.use(buildRateLimit(log, cfg.RATE_LIMIT_PER_SEC));
bot.use(buildAuthI18n(log));

// Conversations (после session, до handlers)
bot.use(conversations());
bot.use(onboarding);
bot.use(addProduct);
bot.use(editSetting);
bot.use(editProduct);

// /start всегда сбрасывает активную conversation, иначе пользователь
// может застрять в незавершённом онбординге и каждое следующее
// сообщение будет интерпретироваться как ответ на текущий шаг.
bot.command('start', async (ctx, next) => {
  await ctx.conversation.exit();
  return next();
});

// /reset — ручная очистка застрявшего conversation-state.
bot.command('reset', async (ctx) => {
  await ctx.conversation.exit();
  await clearConversationFromSession({
    prefix: process.env.REDIS_PREFIX || 'seller:',
    telegramId: ctx.from?.id,
  });
  await ctx.reply(
    ctx.locale === 'uz'
      ? '🔄 Holat tozalandi. /start ni bosing.'
      : '🔄 Состояние очищено. Нажмите /start.',
    { reply_markup: { remove_keyboard: true } },
  );
});

// ─── Handlers ──────────────────────────────────────────────────────
registerStart(bot);

// Callback-кнопки заказов: накладываем guard вручную (чтобы не ловить
// onboarding/настройки)
bot.callbackQuery(/^order:/, statusGuard(), handleOrderCallback);

// Кнопки управления товарами в /myProducts (price/stock/toggle/delete)
bot.callbackQuery(/^prod_mgr:/, statusGuard(), handleProductMgrCallback);

// Inline-меню настроек: запуск editSetting через session.field
bot.callbackQuery(/^set:/, async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();
  if (data === 'set:back') {
    await ctx.deleteMessage().catch(() => {});
    return;
  }
  if (data === 'set:language') {
    const kb = new InlineKeyboard()
      .text(ctx.t('language.choose_uz'), 'lang:uz').row()
      .text(ctx.t('language.choose_ru'), 'lang:ru');
    await ctx.editMessageText(ctx.t('language.choose_title'), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    }).catch(() => {});
    return;
  }
  const field = data.split(':')[1];
  ctx.session.editing_setting_field = field;
  await ctx.conversation.enter('editSetting');
});

// Переключение языка из меню настроек
bot.callbackQuery(/^lang:/, async (ctx) => {
  const lang = ctx.callbackQuery.data.split(':')[1];
  if (lang !== 'uz' && lang !== 'ru') {
    await ctx.answerCallbackQuery();
    return;
  }
  await callFnRow('auth.set_language', [ctx.user.id, lang]);
  ctx.session.language = lang;
  ctx.locale = lang;
  ctx.t = (key, vars) => tFn(lang, key, vars);

  await ctx.answerCallbackQuery({ text: tFn(lang, 'language.saved') });
  if (ctx.shop) {
    await ctx.editMessageText(tFn(lang, 'seller.settings.title'), {
      parse_mode: 'Markdown',
      reply_markup: settingsKeyboard(ctx),
    }).catch(() => {});
  } else {
    await ctx.editMessageText(tFn(lang, 'language.saved')).catch(() => {});
  }
});

// «Сборщик» причины reject — должен идти ДО main-menu router
bot.on('message:text', async (ctx, next) => {
  if (ctx.session?.rejecting_order_id) {
    return handleRejectReason(ctx, next);
  }
  return next();
});

// Главное меню (reply-кнопки) — для активного магазина
bot.on('message:text', statusGuard(), handleMainMenuMessage);

// Если ни один handler не сработал и магазина нет — мягкая подсказка пройти онбординг
bot.on('message', async (ctx) => {
  if (!ctx.shop) {
    await ctx.reply(
      ctx.locale === 'uz'
        ? 'Doʻkoningizni roʻyxatdan oʻtkazish uchun /start ni bosing.'
        : 'Чтобы зарегистрировать магазин, нажмите /start.',
    );
  }
});

// ─── Error handler ─────────────────────────────────────────────────
bot.catch(errorHandler(log));

// ─── Notifier (Redis pub/sub) ──────────────────────────────────────
startNotifier(bot, log);

// ─── Запуск + graceful shutdown ────────────────────────────────────
async function shutdown(signal) {
  log.info({ signal }, 'shutting down');
  try { await bot.stop(); } catch (err) { log.warn({ err: err.message }, 'bot.stop'); }
  try { await closeRedis(); } catch (err) { log.warn({ err: err.message }, 'closeRedis'); }
  try { await closePool();  } catch (err) { log.warn({ err: err.message }, 'closePool'); }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Перед стартом — чистим Redis от протухших conversation-state
// (см. shared/sessionHygiene.js).
await sweepStaleConversations({
  prefix: cfg.REDIS_PREFIX || 'seller:',
  log,
}).catch((err) => log.warn({ err: err.message }, 'sweep failed'));

bot.start({
  drop_pending_updates: true,
  onStart: (info) => log.info({ username: info.username }, '✔ seller-bot started (long polling)'),
});
