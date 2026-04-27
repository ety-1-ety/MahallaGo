/**
 * Нормализация телефонного номера к международному формату с ведущим «+».
 *
 * Telegram contact.phone_number обычно приходит без «+» (например 998901234567).
 * Если пользователь ввёл вручную — возможны пробелы/тире/скобки, может быть
 * без кода страны (9 цифр для Узбекистана).
 *
 * Цель — гарантировать единый формат «+<country><number>» при сохранении в
 * auth.users.phone и при отображении в карточке заказа продавцу.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null} нормализованный «+998901234567» или null если raw пуст
 */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s.length === 0) return null;

  const hasPlus = s.startsWith('+');
  // Удаляем всё кроме цифр (плюс уже учтён флагом)
  const digits = s.replace(/\D+/g, '');
  if (digits.length === 0) return null;

  if (hasPlus) {
    return '+' + digits;
  }

  // Узбекистан: 9 цифр без кода → подставим +998
  if (digits.length === 9) {
    return '+998' + digits;
  }

  // Россия 8XXXXXXXXXX → +7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('8')) {
    return '+7' + digits.slice(1);
  }

  // Уже с кодом страны (998..., 7..., 380..., etc.) — просто добавим «+».
  return '+' + digits;
}

/**
 * Удобный helper для отображения: всегда возвращает строку (вместо null).
 */
export function formatPhone(raw, fallback = '—') {
  const n = normalizePhone(raw);
  return n ?? fallback;
}
