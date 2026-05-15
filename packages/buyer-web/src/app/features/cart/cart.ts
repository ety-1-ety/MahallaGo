import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart/cart.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { formatUZS } from '../../core/format/format';

@Component({
  selector: 'buyer-cart',
  standalone: true,
  imports: [CommonModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">{{ 'miniapp.buyer.cart.title' | t }}</div>
      @if (cart.itemsCount() > 0) {
        <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="onClear()">🗑</button>
      }
    </header>

    @if (!cart.cart() || cart.itemsCount() === 0) {
      <div class="empty">
        <div class="icon">🛒</div>
        <div class="h2">{{ 'miniapp.buyer.cart.empty_title' | t }}</div>
        <div class="muted">{{ 'miniapp.buyer.cart.empty_subtitle' | t }}</div>
        <button class="btn btn-primary btn-block mt-3" (click)="goHome()">
          {{ 'miniapp.buyer.cart.find_shop' | t }}
        </button>
      </div>
    } @else if (cart.cart(); as c) {
      <div class="card mb-3">
        <div class="muted text-sm">{{ 'miniapp.buyer.cart.shop' | t: { name: c.shop_name } }}</div>
      </div>

      <div class="card">
        @for (item of c.items; track item.product_id) {
          <div class="row">
            <div class="grow">
              <div class="semibold">{{ item.name }}</div>
              <div class="text-sm">
                <span class="muted">{{ formatPrice(item.price) }}</span>
                <span style="color:var(--mgo-primary);font-weight:700">&nbsp;×&nbsp;{{ item.qty }}</span>
              </div>
            </div>
            <div class="text-right" style="min-width:90px">
              <div class="semibold">{{ formatPrice(item.price * item.qty) }}</div>
              <div class="flex gap-1 mt-1" style="justify-content:flex-end">
                <button class="chip" (click)="dec(item.product_id)">−</button>
                <button class="chip" (click)="inc(item.product_id)">+</button>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="card mt-3">
        <div class="flex justify-between">
          <span class="muted">{{ 'miniapp.buyer.cart.subtotal' | t }}</span>
          <span class="semibold">{{ formatPrice(cart.subtotal()) }}</span>
        </div>
      </div>
    }
  `,
})
export class CartPage implements OnInit, OnDestroy {
  readonly cart = inject(CartService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  constructor() {
    effect(() => {
      const count = this.cart.itemsCount();
      if (count > 0) {
        this.tg.showMainButton(
          this.locale.t('miniapp.buyer.cart.checkout', { amount: formatUZS(this.cart.subtotal()) }),
          () => this.router.navigateByUrl('/checkout'),
        );
      } else {
        this.tg.hideMainButton();
      }
    });
  }

  ngOnInit() {
    this.tg.showBackButton(() => this.back());
  }
  ngOnDestroy() {
    this.tg.hideBackButton();
    this.tg.hideMainButton();
  }

  back() {
    this.tg.haptic('selection');
    const sid = this.cart.cart()?.shop_id;
    if (sid) this.router.navigate(['/shop', sid]);
    else this.router.navigateByUrl('/');
  }
  goHome() { this.router.navigateByUrl('/'); }
  formatPrice(n: number) { return formatUZS(n); }
  inc(pid: string) { this.tg.haptic('light'); this.cart.setQty(pid, this.cart.qtyOf(pid) + 1); }
  dec(pid: string) { this.tg.haptic('light'); this.cart.setQty(pid, this.cart.qtyOf(pid) - 1); }

  async onClear() {
    const ok = await this.tg.confirm(this.locale.t('miniapp.buyer.cart.clear_confirm'));
    if (!ok) return;
    this.tg.haptic('warning');
    this.cart.clear();
  }
}
