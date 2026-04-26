import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

import { ApiService, type TopCategoryRow } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [MatCardModule, MatTableModule, MatProgressSpinnerModule, BaseChartDirective, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'analytics.title' | t }}</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <mat-card class="chart-card" appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'analytics.shops_growth' | t }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="chart-wrap">
              <canvas baseChart [data]="growthChart()" [options]="chartOpts" type="line"></canvas>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="table-card" appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'analytics.top_categories' | t }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (categories().length === 0) {
              <div class="empty">{{ 'common.empty' | t }}</div>
            } @else {
              <table mat-table [dataSource]="categories()" class="full">
                <ng-container matColumnDef="category">
                  <th mat-header-cell *matHeaderCellDef>{{ 'analytics.col.category' | t }}</th>
                  <td mat-cell *matCellDef="let c">{{ c.emoji || '📦' }} {{ catName(c) }}</td>
                </ng-container>
                <ng-container matColumnDef="shops">
                  <th mat-header-cell *matHeaderCellDef>{{ 'analytics.col.shops' | t }}</th>
                  <td mat-cell *matCellDef="let c" class="num">{{ c.shops }}</td>
                </ng-container>
                <ng-container matColumnDef="products">
                  <th mat-header-cell *matHeaderCellDef>{{ 'analytics.col.products' | t }}</th>
                  <td mat-cell *matCellDef="let c" class="num">{{ c.products }}</td>
                </ng-container>
                <ng-container matColumnDef="revenue">
                  <th mat-header-cell *matHeaderCellDef>{{ 'analytics.col.revenue' | t }}</th>
                  <td mat-cell *matCellDef="let c" class="num">{{ formatUZS(c.revenue) }}</td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="catColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: catColumns"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .loading { display: flex; justify-content: center; padding: 80px; }
    .chart-card, .table-card { margin-bottom: 16px; }
    .chart-wrap { height: 320px; position: relative; }
    .full { width: 100%; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { padding: 32px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `],
})
export class Analytics implements OnInit {
  private readonly api  = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly catColumns = ['category', 'shops', 'products', 'revenue'];
  protected readonly categories = signal<TopCategoryRow[]>([]);
  protected readonly growthChart = signal<ChartData<'line'>>({ labels: [], datasets: [] });
  protected readonly loading = signal(true);

  protected readonly chartOpts: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top' } },
    interaction: { mode: 'index', intersect: false },
  };

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [growth, cats] = await Promise.all([
        this.api.shopsGrowth().toPromise(),
        this.api.topCategories().toPromise(),
      ]);

      this.growthChart.set({
        labels: (growth ?? []).map((d) => d.day),
        datasets: [
          {
            label: this.i18n.t('analytics.shops_registered'),
            data: (growth ?? []).map((d) => d.shops_registered),
            borderColor: '#0099b5',
            backgroundColor: 'rgba(0,153,181,0.15)',
            fill: true, tension: 0.3,
          },
          {
            label: this.i18n.t('analytics.shops_approved'),
            data: (growth ?? []).map((d) => d.shops_approved),
            borderColor: '#1eb53a',
            backgroundColor: 'rgba(30,181,58,0.15)',
            fill: true, tension: 0.3,
          },
        ],
      });

      this.categories.set(cats ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  protected catName(c: TopCategoryRow): string {
    return this.i18n.locale() === 'uz' ? c.name_uz : c.name_ru;
  }

  protected formatUZS(n: number): string {
    const fixed = Math.round(Number(n)).toString();
    const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const suffix = this.i18n.locale() === 'uz' ? 'soʻm' : 'сум';
    return `${grouped} ${suffix}`;
  }
}
