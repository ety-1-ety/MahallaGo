import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { formatUZS, formatTashkentDate } from '../../core/format/format';

interface OrderRow {
  id: string;
  number: number;
  shop_name: string;
  status: 'pending' | 'accepted' | 'ready' | 'delivering' | 'completed' | 'rejected' | 'cancelled';
  total: number;
  created_at: string;
}

@Component({
  selector: 'buyer-orders',
  standalone: true,
  imports: [CommonModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">{{ 'miniapp.buyer.orders.title' | t }}</div>
    </header>

    @if (loading()) {
      <div class="list">
        @for (n of [1,2,3]; track n) {
          <div class="card"><div class="skeleton" style="height:18px;width:60%"></div></div>
        }
      </div>
    } @else if (loadError()) {
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="h2">{{ 'miniapp.common.error_generic' | t }}</div>
        <button class="btn btn-primary btn-block mt-3" (click)="reload()">
          {{ 'miniapp.common.retry' | t }}
        </button>
      </div>
    } @else if (orders().length === 0) {
      <div class="empty">
        <div class="icon">📦</div>
        <div class="h2">{{ 'miniapp.buyer.orders.empty_title' | t }}</div>
        <div class="muted">{{ 'miniapp.buyer.orders.empty_subtitle' | t }}</div>
        <button class="btn btn-primary btn-block mt-3" (click)="goHome()">
          {{ 'miniapp.buyer.cart.find_shop' | t }}
        </button>
      </div>
    } @else {
      <div class="list">
        @for (o of orders(); track o.id) {
          <article class="card">
            <div class="flex justify-between items-center">
              <div class="semibold">{{ 'miniapp.buyer.orders.card_number' | t: { number: o.number } }}</div>
              <div class="muted text-sm">{{ formatDate(o.created_at) }}</div>
            </div>
            <div class="muted text-sm mt-1">{{ o.shop_name }}</div>
            <div class="flex justify-between items-center mt-2">
              <span class="chip">{{ statusKey(o.status) | t }}</span>
              <span class="bold">{{ formatPrice(o.total) }}</span>
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly orders = signal<OrderRow[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  async ngOnInit() {
    // Orders - top-level tab destination: без нативной Telegram BackButton
    // (навигация через нижний таб-бар). Скрываем оставшуюся от прошлых экранов.
    this.tg.hideBackButton();
    await this.load();
  }

  back() { this.tg.haptic('selection'); this.router.navigateByUrl('/'); }
  goHome() { this.router.navigateByUrl('/'); }

  formatPrice(n: number) { return formatUZS(n); }
  formatDate(iso: string) { return formatTashkentDate(iso); }
  statusKey(s: OrderRow['status']) { return `miniapp.buyer.orders.status_${s}`; }

  reload() { this.tg.haptic('selection'); void this.load(); }

  private async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.api.get<{ orders: OrderRow[] }>('/orders/me'));
      this.orders.set(res.orders);
    } catch (e) {
      this.loadError.set((e as { code?: string }).code || 'INTERNAL_ERROR');
      this.tg.haptic('error');
    } finally {
      this.loading.set(false);
    }
  }
}
