// Время и часовой пояс Asia/Tashkent.
//
// База данных хранит TIMESTAMPTZ. Отображаем пользователю в Ташкенте.

export const DEFAULT_TZ = 'Asia/Tashkent';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Форматирует дату в формате DD.MM.YYYY HH:MM в Asia/Tashkent.
 */
export function formatDateTime(date, locale = 'ru', tz = DEFAULT_TZ) {
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleString(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Форматирует только время HH:MM в Asia/Tashkent.
 */
export function formatTime(date, tz = DEFAULT_TZ) {
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleTimeString('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Возвращает ключ дня недели ('sun', 'mon', ...) для текущего момента
 * в указанной зоне.
 */
export function dayKeyAt(date, tz = DEFAULT_TZ) {
  const d = (date instanceof Date) ? date : new Date(date);
  // Воспользуемся Intl.DateTimeFormat - самый надёжный способ
  // получить день недели в произвольной зоне.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const wd = fmt.format(d).toLowerCase();
  // 'mon', 'tue', ... - у Intl они совпадают по 3-буквенному префиксу
  if (DAY_KEYS.includes(wd)) return wd;
  return wd.slice(0, 3);
}

/**
 * Возвращает текущее время как { hh, mm } в указанной зоне.
 */
export function timeOfDayAt(date = new Date(), tz = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hh, mm] = fmt.format(date).split(':').map(Number);
  return { hh, mm };
}

/**
 * Проверяет, открыт ли магазин сейчас по working_hours.
 * Формат working_hours:
 *   { mon: { open: '09:00', close: '22:00' }, sun: { closed: true } }
 * Пустой объект = всегда открыт.
 *
 * (Дублируется в orders._is_shop_open_now на стороне БД - здесь нужно
 * для UI-подсказок «открыт до 22:00» в карточке магазина.)
 */
export function isShopOpenNow(workingHours, tz = DEFAULT_TZ, at = new Date()) {
  if (!workingHours || Object.keys(workingHours).length === 0) return true;

  const dayKey = dayKeyAt(at, tz);
  const today = workingHours[dayKey];
  if (!today) return true;
  if (today.closed === true) return false;

  const { hh, mm } = timeOfDayAt(at, tz);
  const nowMin = hh * 60 + mm;

  const [oh, om] = String(today.open  || '').split(':').map(Number);
  const [ch, cm] = String(today.close || '').split(':').map(Number);
  if (!Number.isFinite(oh) || !Number.isFinite(ch)) return true;

  const openMin  = oh * 60 + om;
  const closeMin = ch * 60 + cm;

  if (closeMin > openMin) {
    return nowMin >= openMin && nowMin < closeMin;
  }
  // ночная смена
  return nowMin >= openMin || nowMin < closeMin;
}

/**
 * Возвращает время закрытия в формате 'HH:MM' для текущего дня,
 * или null если магазин закрыт сегодня.
 */
export function closeTimeToday(workingHours, tz = DEFAULT_TZ, at = new Date()) {
  if (!workingHours) return null;
  const today = workingHours[dayKeyAt(at, tz)];
  if (!today || today.closed === true) return null;
  return today.close || null;
}

/**
 * Форматирует сумму UZS как '40 000 сум' (пробел между разрядами).
 * Локализуется по языку: uz → 'soʻm', ru → 'сум'.
 */
export function formatUZS(amount, locale = 'ru') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  // Округляем до целого, форматируем с пробелом-разделителем
  const fixed = Math.round(n).toString();
  const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // NBSP
  const suffix = locale === 'uz' ? 'soʻm' : 'сум';
  return `${grouped} ${suffix}`;
}
