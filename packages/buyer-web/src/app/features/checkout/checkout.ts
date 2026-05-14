import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, ApiError } from '../../core/api/api.service';
import { CartService } from '../../core/cart/cart.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { formatUZS } from '../../core/format/format';

interface OrderResp {
  order: { id: string; number: number; status: string };
}

@Component({
  selector: 'buyer-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">{{ 'miniapp.buyer.checkout.title' | t }}</div>
    </header>

    @if (success(); as ok) {
      <div class="empty">
        <div class="icon">✅</div>
        <div class="h1">{{ 'miniapp.buyer.checkout.success_title' | t }}</div>
        <div class="muted text-sm">
          {{ 'miniapp.buyer.checkout.success_subtitle' | t: { number: ok.number } }}
        </div>
        <button class="btn btn-primary btn-block mt-3" (click)="goOrders()">
          {{ 'miniapp.buyer.checkout.success_view_orders' | t }}
        </button>
      </div>
    } @else {
      <section class="card mb-3">
        <label class="label">{{ 'miniapp.buyer.checkout.address_label' | t }}</label>
        <textarea class="textarea" rows="3"
                  [(ngModel)]="address"
                  [placeholder]="locale.t('miniapp.buyer.checkout.address_placeholder')"></textarea>
        <button class="btn btn-ghost btn-block mt-2" (click)="useLocation()">
          @if (locationCaptured()) {
            {{ 'miniapp.buyer.checkout.location_captured' | t }}
          } @else {
            {{ 'miniapp.buyer.checkout.use_my_location' | t }}
          }
        </button>
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.buyer.checkout.phone_label' | t }}</label>
        <input class="input" type="tel"
               [(ngModel)]="phone"
               [placeholder]="locale.t('miniapp.buyer.checkout.phone_placeholder')">
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.buyer.checkout.notes_label' | t }}</label>
        <textarea class="textarea" rows="2"
                  [(ngModel)]="notes"
                  [placeholder]="locale.t('miniapp.buyer.checkout.notes_placeholder')"></textarea>
      </section>

      <section class="card">
        <div class="flex justify-between">
          <span class="muted">{{ 'miniapp.buyer.cart.subtotal' | t }}</span>
          <span class="semibold">{{ formatPrice(cart.subtotal()) }}</span>
        </div>
      </section>

      @if (errorMsg(); as msg) {
        <div class="card mt-3" style="border-color: var(--mgo-red)">
          <div class="text-sm" style="color: var(--mgo-red)">{{ msg }}</div>
        </div>
      }
    }
  `,
})
export class CheckoutPage implements OnInit, OnDestroy {
  readonly cart = inject(CartService);
  private readonly tg = inject(TelegramService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly address = signal<string>('');
  readonly phone = signal<string>('');
  readonly notes = signal<string>('');
  readonly latLng = signal<{ lat: number; lng: number } | null>(null);
  readonly locationCaptured = computed(() => this.latLng() !== null);
  readonly submitting = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly success = signal<{ number: number } | null>(null);

  constructor() {
    // MainButton — "Подтвердить заказ · сумма"
    effect(() => {
      if (this.success()) {
        this.tg.hideMainButton();
        return;
      }
      const subtotal = this.cart.subtotal();
      const text = this.locale.t(
        this.submitting() ? 'miniapp.buyer.checkout.submitting' : 'miniapp.buyer.checkout.submit',
        { amount: formatUZS(subtotal) },
      );
      this.tg.showMainButton(text, () => this.submit(), { active: !this.submitting() });
      this.tg.setMainButtonProgress(this.submitting());
    });
  }

  ngOnInit() {
    this.tg.showBackButton(() => this.back());
    const p = this.auth.profile()?.phone;
    if (p) this.phone.set(p);
  }
  ngOnDestroy() {
    this.tg.hideBackButton();
    this.tg.hideMainButton();
  }

  formatPrice(n: number) { return formatUZS(n); }
  back() { this.tg.haptic('selection'); this.router.navigateByUrl('/cart'); }
  goOrders() { this.router.navigateByUrl('/orders'); }

  useLocation() {
    this.tg.haptic('selection');
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latLng.set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        this.tg.haptic('success');
      },
      () => this.tg.haptic('error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async submit() {
    const c = this.cart.cart();
    if (!c) return;
    if (!this.address().trim()) {
      this.errorMsg.set(this.locale.t('miniapp.buyer.errors.ADDRESS_REQUIRED'));
      this.tg.haptic('error');
      return;
    }
    if (!this.phone().trim()) {
      this.errorMsg.set(this.locale.t('miniapp.buyer.errors.PHONE_REQUIRED'));
      this.tg.haptic('error');
      return;
    }
    this.submitting.set(true);
    this.errorMsg.set(null);
    try {
      const body = {
        shop_id: c.shop_id,
        items: c.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
        delivery_address: this.address().trim(),
        delivery_lat: this.latLng()?.lat ?? null,
        delivery_lng: this.latLng()?.lng ?? null,
        phone: this.phone().trim(),
        notes: this.notes().trim() || null,
      };
      const res = await firstValueFrom(this.api.post<OrderResp>('/orders', body));
      this.tg.haptic('success');
      this.cart.clear(c.shop_id);
      this.success.set({ number: res.order.number });
    } catch (e) {
      const code = (e as ApiError).code;
      const detail = (e as ApiError).detail;
      const key = `miniapp.buyer.errors.${code}`;
      const msg = this.locale.hasKey(key) ? this.locale.t(key, detail ? { reason: detail } : undefined) : (detail || this.locale.t('miniapp.common.error_generic'));
      this.errorMsg.set(msg);
      this.tg.haptic('error');
    } finally {
      this.submitting.set(false);
    }
  }
}
