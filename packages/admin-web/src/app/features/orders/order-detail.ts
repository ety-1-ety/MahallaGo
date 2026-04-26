import { Component, ChangeDetectionStrategy, inject, signal, OnInit, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import {
  ApiService,
  type OrderDetailDto,
  type OrderItem,
  type StatusEvent,
} from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [
    MatCardModule, MatIconModule, MatTableModule, MatProgressSpinnerModule, MatDividerModule,
    RouterLink, DatePipe, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <a routerLink="/orders" class="back"><mat-icon>arrow_back</mat-icon> {{ 'common.back' | t }}</a>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (order(); as o) {
        <div class="grid">
          <mat-card class="profile" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'orders.detail.title' | t }} #{{ o.number }}</mat-card-title>
              <mat-card-subtitle>{{ ('orders.status.' + o.status) | t }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="row">
                <mat-icon>store</mat-icon>
                <span class="label">{{ 'orders.detail.shop' | t }}:</span>
                <a [routerLink]="['/shops', o.shop_id]">{{ o.shop_name }}</a>
              </div>
              <div class="row">
                <mat-icon>person</mat-icon>
                <span class="label">{{ 'orders.detail.buyer' | t }}:</span>
                {{ o.buyer_first_name || o.buyer_username || ('@' + o.buyer_telegram_id) }}
                @if (o.buyer_phone) { · {{ o.buyer_phone }} }
              </div>
              <div class="row">
                <mat-icon>place</mat-icon>
                <span class="label">{{ 'orders.detail.address' | t }}:</span>
                {{ o.delivery_address }}
              </div>
              @if (o.distance_m !== null && o.distance_m !== undefined) {
                <div class="row">
                  <mat-icon>straighten</mat-icon>
                  <span class="label">{{ 'orders.detail.distance' | t }}:</span>
                  {{ o.distance_m }} м
                </div>
              }
              <div class="row">
                <mat-icon>payments</mat-icon>
                <span class="label">{{ 'orders.detail.payment' | t }}:</span>
                {{ 'orders.detail.payment_cash' | t }}
              </div>
              @if (o.notes) {
                <div class="row">
                  <mat-icon>chat</mat-icon>
                  <span class="label">{{ 'orders.detail.notes' | t }}:</span>
                  {{ o.notes }}
                </div>
              }
              @if (o.rejection_reason) {
                <div class="row warn">
                  <mat-icon>block</mat-icon>
                  <span class="label">{{ 'orders.detail.rejection_reason' | t }}:</span>
                  {{ o.rejection_reason }}
                </div>
              }
              <mat-divider></mat-divider>
              <div class="totals">
                <div><span>{{ 'orders.detail.subtotal' | t }}</span><span>{{ formatUZS(o.subtotal) }}</span></div>
                <div><span>{{ 'orders.detail.delivery_fee' | t }}</span><span>{{ formatUZS(o.delivery_fee) }}</span></div>
                <div class="total-row"><span>{{ 'orders.detail.total' | t }}</span><span>{{ formatUZS(o.total) }}</span></div>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card class="items" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'orders.detail.items' | t }} ({{ items().length }})</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="items()" class="full">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>{{ 'orders.detail.col_product' | t }}</th>
                  <td mat-cell *matCellDef="let i">{{ i.product_name }}</td>
                </ng-container>
                <ng-container matColumnDef="qty">
                  <th mat-header-cell *matHeaderCellDef>{{ 'orders.detail.col_qty' | t }}</th>
                  <td mat-cell *matCellDef="let i" class="num">{{ i.qty }}</td>
                </ng-container>
                <ng-container matColumnDef="price">
                  <th mat-header-cell *matHeaderCellDef>{{ 'orders.detail.col_price' | t }}</th>
                  <td mat-cell *matCellDef="let i" class="num">{{ formatUZS(i.unit_price) }}</td>
                </ng-container>
                <ng-container matColumnDef="line">
                  <th mat-header-cell *matHeaderCellDef>{{ 'orders.detail.col_total' | t }}</th>
                  <td mat-cell *matCellDef="let i" class="num">{{ formatUZS(i.line_total) }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="itemColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: itemColumns"></tr>
              </table>
            </mat-card-content>
          </mat-card>

          <mat-card class="timeline" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'orders.detail.timeline' | t }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (timeline().length === 0) {
                <div class="empty">{{ 'common.empty' | t }}</div>
              } @else {
                <ol class="events">
                  @for (e of timeline(); track e.id) {
                    <li>
                      <div class="when">{{ e.created_at | date:'dd.MM.yyyy HH:mm' }}</div>
                      <div class="what">
                        @if (e.prev_status) {
                          {{ ('orders.status.' + e.prev_status) | t }} →
                        }
                        <strong>{{ ('orders.status.' + e.new_status) | t }}</strong>
                      </div>
                      <div class="who">
                        @if (e.actor_id) {
                          {{ e.actor_first_name || e.actor_username || ('@' + e.actor_telegram_id) }}
                          @if (e.actor_is_admin) { · {{ 'orders.detail.actor_admin' | t }} }
                        } @else {
                          {{ 'orders.detail.system' | t }}
                        }
                        @if (e.reason) { · «{{ e.reason }}» }
                      </div>
                    </li>
                  }
                </ol>
              }
            </mat-card-content>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 16px; }
    .loading { display: flex; justify-content: center; padding: 80px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .timeline { grid-column: 1 / -1; }
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0;
           color: var(--mat-sys-on-surface-variant); flex-wrap: wrap; }
    .row mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .row .label { font-weight: 500; color: var(--mat-sys-on-surface); }
    .row.warn { color: var(--mat-sys-error); }
    mat-divider { margin: 12px 0; }
    .totals { display: grid; gap: 4px; }
    .totals > div { display: flex; justify-content: space-between; }
    .totals .total-row { font-weight: 600; font-size: 1.05em; padding-top: 6px;
                         border-top: 1px solid var(--mat-sys-outline-variant); margin-top: 4px; }
    .full { width: 100%; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
    .events { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .events li { padding-left: 12px; border-left: 3px solid var(--mat-sys-primary); }
    .when { font-size: 12px; color: var(--mat-sys-on-surface-variant); }
    .what { margin: 2px 0; }
    .who  { font-size: 13px; color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 1023px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class OrderDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly api  = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly itemColumns = ['name', 'qty', 'price', 'line'];
  protected readonly order    = signal<OrderDetailDto | null>(null);
  protected readonly items    = signal<OrderItem[]>([]);
  protected readonly timeline = signal<StatusEvent[]>([]);
  protected readonly loading  = signal(true);

  async ngOnInit() {
    this.loading.set(true);
    try {
      const res = await this.api.order(this.id()).toPromise();
      if (res) {
        this.order.set(res.order);
        this.items.set(res.items);
        this.timeline.set(res.timeline);
      }
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
