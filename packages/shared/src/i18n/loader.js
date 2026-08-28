// i18n loader.
//
// Грузит uz.json и ru.json при старте, кеширует. Поддерживает
// плейсхолдеры {variable} в строках.
//
// Использование:
//   import { t, hasKey, defaultLocale } from '@mahallago/shared/i18n';
//
//   t('uz', 'buyer.menu.find_shops')              // "📍 Yaqin doʻkonlar"
//   t('ru', 'buyer.errors.BELOW_MIN_ORDER',       // "❌ Минимальная сумма заказа: 30 000 сум"
//     { min: '30 000 сум' })

import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const SUPPORTED_LOCALES = Object.freeze(['uz', 'ru']);
export const DEFAULT_LOCALE = 'uz';

// Грузим синхронно один раз при импорте - словари маленькие, не блокируют.
const LOCALES = {};
for (const locale of SUPPORTED_LOCALES) {
  const filePath = path.join(__dirname, 'locales', `${locale}.json`);
  LOCALES[locale] = JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveKey(dict, dotPath) {
  const parts = dotPath.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => {
    const v = vars[name];
    return (v === undefined || v === null) ? m : String(v);
  });
}

/**
 * Перевести ключ на указанный локаль.
 * Если ключ не найден - возвращает сам ключ (для лёгкой диагностики).
 */
export function t(locale, key, vars) {
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  let value = resolveKey(LOCALES[lang], key);

  if (typeof value !== 'string') {
    // fallback на другой локаль (uz ↔ ru)
    const fallback = lang === 'uz' ? 'ru' : 'uz';
    value = resolveKey(LOCALES[fallback], key);
    if (typeof value !== 'string') {
      return key;
    }
  }

  return interpolate(value, vars);
}

/**
 * Проверка наличия ключа (например, для маппинга кодов ошибок).
 */
export function hasKey(locale, key) {
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return typeof resolveKey(LOCALES[lang], key) === 'string';
}

/**
 * Локализованное сообщение для известного DomainError.
 * Соглашение: ключ ошибки лежит в `{role}.errors.{CODE}` где role -
 * 'buyer' или 'seller'.
 */
export function tError(locale, role, code, vars) {
  return t(locale, `${role}.errors.${code}`, vars);
}

/**
 * Локализованное название статуса заказа: 'pending' → '🟡 Ожидает'
 */
export function tOrderStatus(locale, status) {
  return t(locale, `buyer.orders.status_${status}`);
}

export function defaultLocale() {
  return DEFAULT_LOCALE;
}
