import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

import { ApiService, type OrderRow } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

const ACTIVE_STATUSES = 'pending,accepted,ready,delivering';

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [
    MatTableModule, MatCardModule, MatProgressSpinnerModule,
    MatButtonToggleModule, MatPaginatorModule,
    RouterLink, DatePipe, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'orders.title' | t }}</h1>

      <div class="filters">
        <mat-button-toggle-group [value]="statusFilter()" (change)="setStatus($event.value)">
          <mat-button-toggle value="">{{ 'orders.filter.all'       | t }}</mat-button-toggle>
          <mat-button-toggle value="pending">{{ 'orders.filter.pending'   | t }}</mat-button-toggle>
          <mat-button-toggle [value]="ACTIVE_STATUSES">{{ 'orders.filter.active'    | t }}</mat-button-toggle>
          <mat-button-toggle value="completed">{{ 'orders.filter.completed' | t }}</mat-button-toggle>
          <mat-button-toggle value="cancelled,rejected">{{ 'orders.filter.cancelled' | t }}</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <mat-card appearance="outlined">
          <table mat-table [dataSource]="rows()" class="full">
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.number' | t }}</th>
              <td mat-cell *matCellDef="let r">
                <a [routerLink]="['/orders', r.id]">#{{ r.number }}</a>
              </td>
            </ng-container>
            <ng-container matColumnDef="shop">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.shop' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.shop_name }}</td>
            </ng-container>
            <ng-container matColumnDef="buyer">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.buyer' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.buyer_first_name || r.buyer_username || ('@' + r.buyer_telegram_id) }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.total' | t }}</th>
              <td mat-cell *matCellDef="let r" class="num">{{ formatUZS(r.total) }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.status' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ ('orders.status.' + r.status) | t }}</td>
            </ng-container>
            <ng-container matColumnDef="created">
              <th mat-header-cell *matHeaderCellDef>{{ 'orders.col.created' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.created_at | date:'dd.MM.yyyy HH:mm' }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>

          @if (rows().length === 0) {
            <div class="empty">{{ 'common.empty' | t }}</div>
          } @else {
            <mat-paginator
              [length]="total()"
              [pageSize]="perPage()"
              [pageIndex]="page() - 1"
              [pageSizeOptions]="[20, 50, 100]"
              (page)="onPage($event)">
            </mat-paginator>
          }
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .filters { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    .loading { display: flex; justify-content: center; padding: 80px; }
    .full { width: 100%; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { padding: 32px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `],
})
export class OrdersList implements OnInit {
  private readonly api  = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly ACTIVE_STATUSES = ACTIVE_STATUSES;
  protected readonly columns = ['number', 'shop', 'buyer', 'total', 'status', 'created'];
  protected readonly rows = signal<OrderRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal('');
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly perPage = signal(20);

  async ngOnInit() {
    await this.reload();
  }

  setStatus(v: string) {
    this.statusFilter.set(v);
    this.page.set(1);
    this.reload();
  }

  onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.perPage.set(e.pageSize);
    this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      const res = await this.api.orders({
        status: this.statusFilter() || undefined,
        page: this.page(),
        per_page: this.perPage(),
      }).toPromise();
      this.rows.set(res?.items ?? []);
      this.total.set(res?.total ?? 0);
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
