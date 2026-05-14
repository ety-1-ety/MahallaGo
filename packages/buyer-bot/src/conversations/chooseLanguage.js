import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';
import { callFnRow, query, t as tFn, normalizePhone } from '@mahallago/shared';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

/**
 * Первичная регистрация покупателя:
 *   1) Выбор языка (если ещё не выбран)
 *   2) Запрос номера телефона (если ещё не сохранён)
 *
 * Шаги независимые — запускаются только если соответствующего поля нет.
 * Это удобно для существующих пользователей: им зайдёт только phone-step,
 * новым — оба шага подряд.
 */
async function chooseLanguageConv(conversation, ctx) {
  let lang = ctx.session.language || ctx.user?.language_code || 'uz';
  let lastCtx = ctx;

  // ── 1. Выбор языка ──────────────────────────────────────────
  if (!ctx.session.language_chosen) {
    await ctx.reply(tFn('uz', 'language.choose_title') + '\n' + tFn('ru', 'language.choose_title'), {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('🇺🇿 Oʻzbekcha', 'lang:uz').row()
        .text('🇷🇺 Русский',   'lang:ru'),
    });

    const cb = await conversation.waitForCallbackQuery(/^lang:/);
    lang = cb.callbackQuery.data.split(':')[1];
    await cb.answerCallbackQuery();

    // UPDATE через external — replay не должен повторно дёргать БД.
    await conversation.external(() => callFnRow('auth.set_language', [ctx.user.id, lang]));

    // ВАЖНО: мутируем сессию через cb, а НЕ ctx.
    // ctx в grammY conversations 1.x — это исходный контекст, мутации
    // его session не персистятся. Сохраняется session ПОСЛЕДНЕГО wait-ctx.
    cb.session.language = lang;
    cb.session.language_chosen = true;
    cb.locale = lang;
    cb.t = (k, v) => tFn(lang, k, v);

    await cb.editMessageText(tFn(lang, 'language.saved'));
    lastCtx = cb;
  }

  // ── 2. Запрос телефона ──────────────────────────────────────
  // Продавцу понадобится связь с покупателем — собираем номер
  // один раз при регистрации. На последующих /start этот шаг скипается.
  if (!ctx.user?.phone) {
    await lastCtx.reply(tFn(lang, 'buyer.checkout.ask_phone'), {
      reply_markup: new Keyboard()
        .requestContact(tFn(lang, 'buyer.checkout.phone_button'))
        .resized().oneTime(),
    });

    let phone = null;
    while (phone === null) {
      const m = await conversation.wait();
      if (m.message?.contact?.phone_number) {
        phone = normalizePhone(m.message.contact.phone_number);
        if (phone) break;
      }
      if (m.message?.text) {
        const candidate = normalizePhone(m.message.text);
        if (candidate && /^\+\d{9,15}$/.test(candidate)) {
          phone = candidate;
          break;
        }
      }
      phone = null;
      await m.reply(tFn(lang, 'buyer.checkout.phone_invalid'));
      lastCtx = m;
    }

    await conversation.external(() => query(
      'UPDATE auth.users SET phone = $1, updated_at = NOW() WHERE id = $2',
      [phone, ctx.user.id],
    ));
    ctx.user.phone = phone;  // локально, чтобы ctx был согласован

    // m из последней итерации — берём свежий ctx
    lastCtx.session = lastCtx.session || ctx.session;
  }

  // ── 3. Главное меню ─────────────────────────────────────────
  const t = (k, v) => tFn(lang, k, v);
  await lastCtx.reply(tFn(lang, 'buyer.menu.title'), {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard({ locale: lang, t }),
  });
}

export const chooseLanguage = createConversation(chooseLanguageConv, 'chooseLanguage');
