import 'dotenv/config';
import { Bot } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import {
  createLogger, loadConfig, closePool, closeRedis,
  sweepStaleConversations, clearConversationFromSession,
} from '@mahallago/shared';

import { buildSession }   from './middleware/session.js';
import { buildAuthI18n }  from './middleware/i18n.js';
import { buildRateLimit } from './middleware/rateLimit.js';
import { errorHandler }   from './middleware/errorHandler.js';

import { chooseLanguage } from './conversations/chooseLanguage.js';
import { checkout }       from './conversations/checkout.js';

import { registerStart }  from './handlers/start.js';
import { handleMainMenuMessage } from './handlers/menu.js';
import { handleLocation, handleReuseLocation } from './handlers/findShops.js';
import { handleOpenShop, handleCategory, handleProductCallback } from './handlers/browseShop.js';
import { handleCartCallback } from './handlers/cart.js';
import { handleLanguageCallback } from './handlers/settings.js';
import { startBuyerNotifier } from './notifier.js';

const log = createLogger('buyer-bot');

const cfg = loadConfig({
  required: ['BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'],
  optional: {
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    REDIS_PREFIX: 'buyer:',
    REDIS_CHANNEL_NEW_ORDER: 'orders:new',
    REDIS_CHANNEL_ORDER_STATUS: 'orders:status',
    RATE_LIMIT_PER_SEC: 10,
  },
  numbers: ['RATE_LIMIT_PER_SEC'],
});

const bot = new Bot(cfg.BOT_TOKEN);

bot.use(buildSession());
bot.use(buildRateLimit(log, cfg.RATE_LIMIT_PER_SEC));
bot.use(buildAuthI18n(log));

bot.use(conversations());
bot.use(chooseLanguage);
bot.use(checkout);

// /start всегда сбрасывает активную conversation. Без этого пользователь
// может застрять в чек-ауте/выборе языка и каждое сообщение будет
// интерпретироваться как ответ на текущий шаг.
bot.command('start', async (ctx, next) => {
  await ctx.conversation.exit();
  return next();
});

// /reset — ручная очистка застрявшего conversation-state в Redis.
// Если /start не помогает (баг или несовместимость state), пользователь
// может выбраться через /reset и продолжить работу.
bot.command('reset', async (ctx) => {
  await ctx.conversation.exit();
  await clearConversationFromSession({
    prefix: process.env.REDIS_PREFIX || 'buyer:',
    telegramId: ctx.from?.id,
  });
  await ctx.reply(
    ctx.locale === 'uz'
      ? '🔄 Holat tozalandi. /start ni bosing.'
      : '🔄 Состояние очищено. Нажмите /start.',
    { reply_markup: { remove_keyboard: true } },
  );
});

registerStart(bot);

// Inline-callback'и
bot.callbackQuery(/^lang:/,    handleLanguageCallback);
bot.callbackQuery(/^shop:open:/, async (ctx) => {
  const shopId = ctx.callbackQuery.data.split(':')[2];
  await ctx.answerCallbackQuery();
  await handleOpenShop(ctx, shopId);
});
bot.callbackQuery(/^cat:/, async (ctx) => {
  const catId = ctx.callbackQuery.data.split(':')[1];
  await ctx.answerCallbackQuery();
  await handleCategory(ctx, catId);
});
bot.callbackQuery(/^prod:/, handleProductCallback);
bot.callbackQuery(/^cart:/, handleCartCallback);
bot.callbackQuery('loc:reuse', handleReuseLocation);

// Fallback для notes:skip / notes:cancel — основная обработка идёт внутри
// checkout conversation; этот хэндлер ловит лишь повторные клики по
// «протухшим» кнопкам после завершения flow, чтобы не висел спиннер.
bot.callbackQuery(/^notes:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  } catch { /* ignore */ }
});

// Геолокация для поиска магазинов
bot.on('message:location', handleLocation);

// Главное меню reply-кнопками
bot.on('message:text', handleMainMenuMessage);

// Fallback на любое остальное
bot.on('message', async (ctx) => {
  if (!ctx.session.language_chosen || !ctx.user?.phone) {
    await ctx.conversation.enter('chooseLanguage');
    return;
  }
  await ctx.reply(ctx.t('buyer.menu.title'), { parse_mode: 'Markdown' });
});

bot.catch(errorHandler(log));

// Подписка на уведомления о смене статуса заказа от seller-bot.
startBuyerNotifier(bot, log);

async function shutdown(signal) {
  log.info({ signal }, 'shutting down');
  try { await bot.stop(); } catch (err) { log.warn({ err: err.message }, 'bot.stop'); }
  try { await closeRedis(); } catch (err) { log.warn({ err: err.message }, 'closeRedis'); }
  try { await closePool();  } catch (err) { log.warn({ err: err.message }, 'closePool'); }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Перед стартом — чистим Redis от протухших conversation-state.
// Если предыдущая сессия бота крашнулась посреди checkout/onboarding,
// в session.conversation останется битый replay-state, который при
// следующем сообщении пользователя зацикливает обработку updates.
await sweepStaleConversations({
  prefix: cfg.REDIS_PREFIX || 'buyer:',
  log,
}).catch((err) => log.warn({ err: err.message }, 'sweep failed'));

// Периодическая страховка для idle-сессий — каждые 10 минут.
const sweepInterval = setInterval(() => {
  sweepStaleConversations({
    prefix: cfg.REDIS_PREFIX || 'buyer:',
    log,
  }).catch((err) => log.warn({ err: err.message }, 'periodic sweep failed'));
}, 10 * 60 * 1000);
sweepInterval.unref();

bot.start({
  drop_pending_updates: true,
  onStart: (info) => log.info({ username: info.username }, '✔ buyer-bot started (long polling)'),
});
