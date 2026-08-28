import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { LocaleService } from '../../core/i18n/locale.service';
import { formatUZS, formatDistance } from '../../core/format/format';

interface ShopNearby {
  id: string;
  name: string;
  category: string | null;
  distance_m: number;
  is_open_now: boolean;
  open_until: string | null;
  min_order_amount: number;
  delivery_fee: number;
  free_delivery_from: number | null;
  photo_path: string | null;
}

@Component({
  selector: 'buyer-home',
  standalone: true,
  imports: [CommonModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <div class="title">{{ 'miniapp.buyer.home.title' | t }}</div>
      <button class="btn btn-ghost" style="min-height:36px;padding:0 10px" (click)="goSettings()">
        {{ locale.current() === 'uz' ? 'UZ' : 'RU' }}
      </button>
    </header>

    <p class="subtitle mb-3">{{ 'miniapp.buyer.home.subtitle' | t }}</p>

    @if (recentShops().length > 0 && (state() === 'idle' || state() === 'denied' || state() === 'error')) {
      <h2 class="h2">{{ 'miniapp.buyer.home.order_again' | t }}</h2>
      <div class="list mb-3">
        @for (r of recentShops(); track r.id) {
          <article class="card tappable" (click)="openShop(r.id)">
            <div class="flex items-center gap-2">
              <div class="grow">
                <div class="semibold">{{ r.name }}</div>
                <span class="chip mt-1" [class.chip-primary]="r.is_open_now" [class.chip-danger]="!r.is_open_now">
                  {{ (r.is_open_now ? 'miniapp.buyer.shop_card.open_now' : 'miniapp.buyer.shop_card.closed_now') | t }}
                </span>
              </div>
              <span style="font-size:20px">↻</span>
            </div>
          </article>
        }
      </div>
    }

    @if (state() === 'idle') {
      <div class="empty">
        <div class="icon">📍</div>
        <div class="h2">{{ 'miniapp.buyer.home.request_location' | t }}</div>
        <button class="btn btn-primary btn-block mt-2" (click)="locate()">
          {{ 'miniapp.buyer.home.find_button' | t }}
        </button>
      </div>
    } @else if (state() === 'locating') {
      <div class="empty">
        <div class="icon">📡</div>
        <div class="h2">{{ 'miniapp.buyer.home.locating' | t }}</div>
      </div>
    } @else if (state() === 'denied') {
      <div class="empty">
        <div class="icon">🚫</div>
        <div class="h2">{{ 'miniapp.buyer.home.denied' | t }}</div>
        <button class="btn btn-ghost btn-block mt-2" (click)="locate()">
          {{ 'miniapp.common.retry' | t }}
        </button>
      </div>
    } @else if (state() === 'loading') {
      <div class="list">
        @for (n of [1,2,3,4]; track n) {
          <div class="card">
            <div class="skeleton" style="height: 18px; width: 60%; margin-bottom: 8px"></div>
            <div class="skeleton" style="height: 12px; width: 40%; margin-bottom: 8px"></div>
            <div class="skeleton" style="height: 12px; width: 80%"></div>
          </div>
        }
      </div>
    } @else if (state() === 'error') {
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="h2">{{ 'miniapp.common.error_generic' | t }}</div>
        <button class="btn btn-ghost btn-block mt-2" (click)="locate()">
          {{ 'miniapp.common.retry' | t }}
        </button>
      </div>
    } @else if (state() === 'ready') {
      @if (shops().length === 0) {
        <div class="empty">
          <div class="icon">🏪</div>
          <div class="h2">{{ 'miniapp.buyer.home.no_shops_nearby' | t }}</div>
        </div>
      } @else {
        <div class="muted text-sm mb-2">
          {{ 'miniapp.buyer.home.found_count' | t: { count: shops().length } }}
        </div>
        <div class="list">
          @for (s of shops(); track s.id) {
            <article class="card tappable" (click)="openShop(s.id)">
              <div class="flex items-center gap-2">
                <div class="grow">
                  <div class="h3">{{ s.name }}</div>
                  <div class="flex gap-1 mt-1">
                    <span class="chip" [class.chip-primary]="s.is_open_now" [class.chip-danger]="!s.is_open_now">
                      {{ (s.is_open_now ? 'miniapp.buyer.shop_card.open_now' : 'miniapp.buyer.shop_card.closed_now') | t }}
                    </span>
                    <span class="chip">📍 {{ distance(s).value }} {{ distance(s).unit === 'm' ? 'м' : 'км' }}</span>
                  </div>
                  <div class="muted text-sm mt-2">
                    {{ deliveryLabel(s) }}
                  </div>
                </div>
              </div>
            </article>
          }
        </div>
      }
    }
  `,
})
export class Home implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly state = signal<'idle' | 'locating' | 'denied' | 'loading' | 'ready' | 'error'>('idle');
  readonly shops = signal<ShopNearby[]>([]);
  readonly recentShops = signal<{ id: string; name: string; is_open_now: boolean }[]>([]);

  ngOnInit() {
    // Home - корневой экран без MainButton/BackButton.
    // Скрываем оставшиеся от предыдущих экранов (cart / checkout / shop).
    this.tg.hideMainButton();
    this.tg.hideBackButton();
    void this.loadRecent();
  }

  private async loadRecent() {
    try {
      const res = await firstValueFrom(
        this.api.get<{ shops: { id: string; name: string; is_open_now: boolean }[] }>('/shops/recent'),
      );
      this.recentShops.set(res.shops || []);
    } catch { /* блок «Заказать снова» просто не покажется */ }
  }
  ngOnDestroy() { /* leave buttons to next page to manage */ }

  goSettings() {
    this.tg.haptic('selection');
    this.router.navigateByUrl('/settings');
  }

  distance(s: ShopNearby) { return formatDistance(s.distance_m); }

  deliveryLabel(s: ShopNearby): string {
    if (s.delivery_fee <= 0) return this.locale.t('miniapp.buyer.shop_card.delivery_free');
    if (s.free_delivery_from && s.free_delivery_from > 0) {
      return this.locale.t('miniapp.buyer.shop_card.delivery_free_from', { amount: formatUZS(s.free_delivery_from) })
        + ' · ' + this.locale.t('miniapp.buyer.shop_card.delivery_fee', { fee: formatUZS(s.delivery_fee) });
    }
    return this.locale.t('miniapp.buyer.shop_card.delivery_fee', { fee: formatUZS(s.delivery_fee) });
  }

  async locate() {
    this.tg.haptic('selection');
    this.state.set('locating');
    if (!navigator.geolocation) {
      this.state.set('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        this.state.set('loading');
        try {
          const res = await firstValueFrom(
            this.api.get<{ shops: ShopNearby[] }>('/shops/nearby', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          );
          this.shops.set(res.shops || []);
          this.state.set('ready');
        } catch {
          this.state.set('error');
        }
      },
      () => this.state.set('denied'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  openShop(id: string) {
    this.tg.haptic('light');
    this.router.navigate(['/shop', id]);
  }
}
