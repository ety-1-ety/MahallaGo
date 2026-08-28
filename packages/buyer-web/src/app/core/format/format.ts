// Утилиты форматирования - соответствуют тому, что используется в ботах.

export function formatUZS(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const withSpaces = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSpaces} сум`;
}

export function formatDistance(meters: number | null | undefined): { value: string; unit: 'm' | 'km' } {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) {
    return { value: '—', unit: 'm' };
  }
  if (meters < 1000) return { value: String(Math.round(meters)), unit: 'm' };
  return { value: (meters / 1000).toFixed(1), unit: 'km' };
}

export function formatTashkentDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
