import { Component, ChangeDetectionStrategy, inject, signal, OnInit, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ApiService, type ShopDetail as ShopDetailDto, type ProductRow } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { RejectDialog } from '../moderation/reject-dialog';

@Component({
  selector: 'app-shop-detail',
  standalone: true,
  imports: [
    MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatDialogModule,
    RouterLink, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <a routerLink="/shops" class="back"><mat-icon>arrow_back</mat-icon> {{ 'common.back' | t }}</a>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (shop()) {
        <div class="grid">
          <mat-card class="profile" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ shop()!.name }}</mat-card-title>
              <mat-card-subtitle>{{ ('shops.status.' + shop()!.status) | t }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="row"><mat-icon>place</mat-icon> {{ shop()!.address }}</div>
              <div class="row"><mat-icon>phone</mat-icon> {{ shop()!.phone }}</div>
              @if (shop()!.description) { <div class="row"><mat-icon>info</mat-icon> {{ shop()!.description }}</div> }
              <div class="row"><mat-icon>schedule</mat-icon>
                {{ shop()!.is_accepting_orders ? '🟢' : '🔴' }}
                {{ shop()!.is_accepting_orders ? 'Принимает заказы' : 'Не принимает' }}
              </div>
              <hr>
              <div class="row"><mat-icon>shopping_cart</mat-icon> Мин. заказ: {{ formatUZS(shop()!.min_order_amount) }}</div>
              @if (shop()!.max_order_amount) {
                <div class="row"><mat-icon>diamond</mat-icon> Макс. заказ: {{ formatUZS(shop()!.max_order_amount!) }}</div>
              }
              <div class="row"><mat-icon>local_shipping</mat-icon> Доставка: {{ formatUZS(shop()!.delivery_fee) }}</div>
              @if (shop()!.free_delivery_from) {
                <div class="row"><mat-icon>card_giftcard</mat-icon> Бесплатно от: {{ formatUZS(shop()!.free_delivery_from!) }}</div>
              }
              <div class="row"><mat-icon>radar</mat-icon> Радиус: {{ shop()!.delivery_radius_m }} м</div>
            </mat-card-content>
            <mat-card-actions>
              @if (shop()!.status === 'active') {
                <button mat-flat-button color="warn" (click)="suspend()">
                  <mat-icon>block</mat-icon> {{ 'shops.detail.suspend' | t }}
                </button>
              }
            </mat-card-actions>
          </mat-card>

          <mat-card class="products" appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'shops.detail.products' | t }} ({{ products().length }})</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (products().length === 0) {
                <div class="empty">{{ 'shops.detail.no_products' | t }}</div>
              } @else {
                @for (p of products(); track p.id) {
                  <div class="product-item">
                    <div class="product-name">{{ p.emoji }} {{ p.name }}</div>
                    <div class="product-meta">
                      {{ formatUZS(p.price) }}  ·  📦 {{ p.stock }}
                      @if (!p.is_active) { · ⚪ скрыт }
                    </div>
                  </div>
                }
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
    .row { display: flex; align-items: center; gap: 8px; margin: 8px 0;
           color: var(--mat-sys-on-surface-variant); }
    .row mat-icon { font-size: 18px; width: 18px; height: 18px; }
    hr { border: none; border-top: 1px solid var(--mat-sys-outline-variant); margin: 12px 0; }
    .product-item { padding: 8px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .product-item:last-child { border-bottom: none; }
    .product-name { font-weight: 500; }
    .product-meta { color: var(--mat-sys-on-surface-variant); font-size: 13px; margin-top: 2px; }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 1023px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ShopDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);

  protected readonly shop = signal<ShopDetailDto | null>(null);
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly loading  = signal(true);

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const [shop, products] = await Promise.all([
        this.api.shop(this.id()).toPromise(),
        this.api.shopProducts(this.id()).toPromise(),
      ]);
      if (shop) this.shop.set(shop);
      this.products.set(products ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async suspend() {
    const ref = this.dialog.open(RejectDialog, { width: '400px' });
    const reason = await ref.afterClosed().toPromise();
    if (!reason) return;
    try {
      await this.api.suspendShop(this.id(), reason).toPromise();
      await this.load();
    } catch {
      alert(this.i18n.t('common.error'));
    }
  }

  protected formatUZS(n: number): string {
    const fixed = Math.round(Number(n)).toString();
    const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const suffix = this.i18n.locale() === 'uz' ? 'soʻm' : 'сум';
    return `${grouped} ${suffix}`;
  }
}
