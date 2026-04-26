import { callFn, formatUZS } from '@mahallashop/shared';

/**
 * Статистика магазина за сегодня / неделю / месяц.
 * Использует orders.get_dashboard_stats.
 */
export async function handleStats(ctx) {
  if (!ctx.shop) return;

  const periods = ['today', 'week', 'month'];
  const labels = ctx.locale === 'uz'
    ? { today: 'Bugun', week: 'Hafta', month: 'Oy' }
    : { today: 'Сегодня', week: 'Неделя', month: 'Месяц' };

  const sections = [];

  for (const period of periods) {
    const rows = await callFn('orders.get_dashboard_stats', [ctx.shop.id, period]);
    const s = rows[0] || {};
    const block = [
      `*${labels[period]}*`,
      ctx.locale === 'uz'
        ? `📦 Buyurtmalar: ${s.orders_total || 0}`
        : `📦 Заказы: ${s.orders_total || 0}`,
      ctx.locale === 'uz'
        ? `🟡 Kutilmoqda: ${s.orders_pending || 0}  •  ✅ ${s.orders_completed || 0}  •  ❌ ${s.orders_cancelled || 0}`
        : `🟡 Ожидают: ${s.orders_pending || 0}  •  ✅ ${s.orders_completed || 0}  •  ❌ ${s.orders_cancelled || 0}`,
      ctx.locale === 'uz'
        ? `💰 Tushum: ${formatUZS(s.revenue_completed || 0, 'uz')}`
        : `💰 Выручка: ${formatUZS(s.revenue_completed || 0, 'ru')}`,
    ].join('\n');
    sections.push(block);
  }

  const text = `📊 *${ctx.locale === 'uz' ? 'Statistika' : 'Статистика'}*\n\n` + sections.join('\n\n─────\n\n');

  await ctx.reply(text, { parse_mode: 'Markdown' });
}
