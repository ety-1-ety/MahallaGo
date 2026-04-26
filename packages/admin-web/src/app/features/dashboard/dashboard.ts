import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

import { ApiService, type DashboardKpis } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { KpiCard } from '../../shared/kpi-card/kpi-card';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule, BaseChartDirective, KpiCard, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'dashboard.title' | t }}</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (kpis()) {
        <div class="kpi-grid">
          <app-kpi-card icon="storefront"  iconBg="#1eb53a"
                       [label]="'dashboard.kpi.shops_active'  | t"
                       [value]="kpis()!.shops.active" />
          <app-kpi-card icon="gavel"        iconBg="#f59e0b"
                       [label]="'dashboard.kpi.shops_pending' | t"
                       [value]="kpis()!.shops.pending" />
          <app-kpi-card icon="receipt_long" iconBg="#0099b5"
                       [label]="'dashboard.kpi.orders_today'  | t"
                       [value]="kpis()!.orders.today" />
          <app-kpi-card icon="local_shipping" iconBg="#7c3aed"
                       [label]="'dashboard.kpi.orders_active' | t"
                       [value]="kpis()!.orders.active" />
          <app-kpi-card icon="payments"    iconBg="#1eb53a"
                       [label]="'dashboard.kpi.gmv_today'     | t"
                       [value]="formatUZS(kpis()!.gmv.today)" />
          <app-kpi-card icon="trending_up" iconBg="#0099b5"
                       [label]="'dashboard.kpi.gmv_month'     | t"
                       [value]="formatUZS(kpis()!.gmv.this_month)" />
          <app-kpi-card icon="group"       iconBg="#64748b"
                       [label]="'dashboard.kpi.users_total'   | t"
                       [value]="kpis()!.users.total" />
        </div>

        <div class="charts">
          <mat-card class="chart-card" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'dashboard.chart.gmv_30d' | t }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="chart-wrap">
                <canvas baseChart [data]="gmvChart()" [options]="chartOpts" type="line"></canvas>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card class="chart-card" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'dashboard.chart.orders_by_hour' | t }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="chart-wrap">
                <canvas baseChart [data]="hourChart()" [options]="chartOpts" type="bar"></canvas>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .loading { display: flex; justify-content: center; padding: 80px; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .chart-card { padding: 16px; }
    .chart-wrap { height: 280px; position: relative; }
    @media (max-width: 1023px) { .charts { grid-template-columns: 1fr; } }
  `],
})
export class Dashboard implements OnInit {
  private readonly api  = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly kpis    = signal<DashboardKpis | null>(null);
  protected readonly loading = signal(true);
  protected readonly gmvChart  = signal<ChartData<'line'>>({ labels: [], datasets: [] });
  protected readonly hourChart = signal<ChartData<'bar'>>({ labels: [], datasets: [] });

  protected readonly chartOpts: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [k, gmv, hours] = await Promise.all([
        this.api.dashboardKpis().toPromise(),
        this.api.gmvTrend().toPromise(),
        this.api.ordersByHour().toPromise(),
      ]);
      if (k) this.kpis.set(k);

      this.gmvChart.set({
        labels: (gmv ?? []).map((d) => d.day),
        datasets: [{
          data: (gmv ?? []).map((d) => Number(d.gmv)),
          borderColor: '#1eb53a',
          backgroundColor: 'rgba(30,181,58,0.15)',
          fill: true, tension: 0.3,
        }],
      });

      const byHour = new Array(24).fill(0);
      for (const r of hours ?? []) byHour[r.hour] = r.count;
      this.hourChart.set({
        labels: byHour.map((_, i) => `${i}:00`),
        datasets: [{
          data: byHour,
          backgroundColor: '#0099b5',
          borderRadius: 4,
        }],
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected formatUZS(n: number): string {
    const fixed = Math.round(Number(n)).toString();
    const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const suffix = this.i18n.locale() === 'uz' ? 'soʻm' : 'сум';
    return `${grouped} ${suffix}`;
  }
}
