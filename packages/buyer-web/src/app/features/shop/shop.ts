import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { CartService } from '../../core/cart/cart.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { formatUZS } from '../../core/format/format';

interface ShopDetail {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  photo_path: string | null;
  is_open_now: boolean;
  open_until: string | null;
  min_order_amount: number;
  delivery_fee: number;
  free_delivery_from: number | null;
  is_accepting_orders: boolean;
}
interface CategoryRow { id: string; name_uz: string; name_ru: string; emoji: string; product_count: number; }
interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  photo_path: string | null;
  category_id: string | null;
}

@Component({
  selector: 'buyer-shop',
  standalone: true,
  imports: [CommonModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">{{ shop()?.name ?? '…' }}</div>
    </header>

    @if (loading()) {
      <div class="list">
        @for (n of [1,2,3]; track n) {
          <div class="card"><div class="skeleton" style="height:16px;width:50%"></div></div>
        }
      </div>
    } @else if (loadError(); as code) {
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="h2">{{ errorLabel(code) }}</div>
        <button class="btn btn-primary btn-block mt-2" (click)="back()">
          {{ 'miniapp.common.back' | t }}
        </button>
      </div>
    } @else if (shop(); as s) {
      <section class="card mb-3">
        @if (s.is_open_now) {
          <span class="chip chip-primary">{{ 'miniapp.buyer.shop_card.open_now' | t }}</span>
        } @else {
          <span class="chip chip-danger">{{ 'miniapp.buyer.shop_card.closed_now' | t }}</span>
        }
        <div class="h3 mt-2">{{ s.name }}</div>
        @if (s.description) {
          <div class="muted text-sm">{{ s.description }}</div>
        }
        <div class="flex gap-1 mt-2">
          <span class="chip">{{ 'miniapp.buyer.shop_card.min_order' | t: { amount: formatPrice(s.min_order_amount) } }}</span>
          @if (s.delivery_fee > 0) {
            <span class="chip">{{ 'miniapp.buyer.shop_card.delivery_fee' | t: { fee: formatPrice(s.delivery_fee) } }}</span>
          } @else {
            <span class="chip chip-primary">{{ 'miniapp.buyer.shop_card.delivery_free' | t }}</span>
          }
        </div>
      </section>

      <h2 class="h2">{{ 'miniapp.buyer.shop.categories' | t }}</h2>
      <div class="flex gap-1 mb-3" style="overflow-x:auto;padding-bottom:6px">
        <button class="chip" [class.chip-primary]="!selectedCat()" (click)="filter(null)">
          {{ 'miniapp.buyer.shop.all_products' | t }}
        </button>
        @for (c of categories(); track c.id) {
          <button class="chip" [class.chip-primary]="selectedCat() === c.id" (click)="filter(c.id)">
            {{ c.emoji }} {{ catName(c) }} · {{ c.product_count }}
          </button>
        }
      </div>

      @if (productsError()) {
        <div class="empty">
          <div class="icon">⚠️</div>
          <div class="muted">{{ 'miniapp.common.error_generic' | t }}</div>
          <button class="btn btn-primary btn-block mt-2" (click)="retryProducts()">
            {{ 'miniapp.common.retry' | t }}
          </button>
        </div>
      } @else if (products().length === 0) {
        <div class="empty">
          <div class="icon">📦</div>
          <div class="muted">{{ 'miniapp.buyer.shop.no_products' | t }}</div>
        </div>
      } @else {
        <div class="list">
          @for (p of products(); track p.id) {
            <article class="card">
              <div class="flex gap-2 items-center">
                @if (p.photo_path) {
                  <img [src]="photoUrl(p.photo_path)" alt="" loading="lazy"
                       (click)="openZoom(p.photo_path); $event.stopPropagation()"
                       style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none;background:var(--mgo-surface-mute);cursor:zoom-in" />
                }
                <div class="grow">
                  <div class="semibold">{{ p.name }}</div>
                  @if (p.description) {
                    <div class="muted text-sm" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                      {{ p.description }}
                    </div>
                  }
                  <div class="bold text-lg mt-1">{{ formatPrice(p.price) }}</div>
                </div>
              </div>
              <div class="mt-2">
                @if (p.stock <= 0) {
                  <span class="chip chip-danger">{{ 'miniapp.buyer.shop.out_of_stock' | t }}</span>
                } @else if (qtyOf(p.id) === 0) {
                  <button class="btn btn-primary btn-block" (click)="add(p)">{{ 'miniapp.buyer.shop.add_to_cart' | t }}</button>
                } @else {
                  <div class="flex items-center gap-2">
                    <button class="btn btn-ghost" style="min-width:48px;padding:0" (click)="dec(p)">−</button>
                    <div class="grow text-center semibold">{{ qtyOf(p.id) }} · {{ formatPrice(p.price * qtyOf(p.id)) }}</div>
                    <button class="btn btn-ghost" style="min-width:48px;padding:0" (click)="inc(p)">+</button>
                  </div>
                }
              </div>
            </article>
          }
        </div>
      }
    }
    @if (zoomPhoto(); as zp) {
      <div class="photo-zoom" (click)="closeZoom()">
        <img [src]="photoUrl(zp)" alt="" />
      </div>
    }
  `,
})
export class ShopPage implements OnInit, OnDestroy {
  @Input() id!: string;

  private readonly api = inject(ApiService);
  private readonly cart = inject(CartService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly shop = signal<ShopDetail | null>(null);
  readonly categories = signal<CategoryRow[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedCat = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly productsError = signal<string | null>(null);
  readonly zoomPhoto = signal<string | null>(null);

  readonly cartItemsCount = computed(() => this.cart.itemsCount());
  readonly cartSubtotal = computed(() => this.cart.subtotal());

  constructor() {
    // MainButton: показываем «Перейти в корзину · сумма», если есть товары этого магазина
    effect(() => {
      const count = this.cartItemsCount();
      const cartShopId = this.cart.cart()?.shop_id;
      if (count > 0 && cartShopId === this.id) {
        this.tg.showMainButton(
          this.locale.t('miniapp.buyer.shop.go_to_cart', { amount: formatUZS(this.cartSubtotal()) }),
          () => this.router.navigateByUrl('/cart'),
        );
      } else {
        this.tg.hideMainButton();
      }
    });
  }

  async ngOnInit() {
    this.tg.showBackButton(() => this.back());
    this.cart.loadShop(this.id);
    await this.loadShop();
    await this.loadProducts(null);
  }

  ngOnDestroy() {
    this.tg.hideBackButton();
    this.tg.hideMainButton();
  }

  back() {
    this.tg.haptic('selection');
    this.router.navigateByUrl('/');
  }

  qtyOf(pid: string) { return this.cart.qtyOf(pid); }

  catName(c: CategoryRow) { return this.locale.current() === 'uz' ? c.name_uz : c.name_ru; }
  photoUrl(p: string) { return `/photos/${p}`; }
  openZoom(p: string) { this.tg.haptic('light'); this.zoomPhoto.set(p); }
  closeZoom() { this.tg.haptic('selection'); this.zoomPhoto.set(null); }
  retryProducts() { this.tg.haptic('selection'); void this.loadProducts(this.selectedCat()); }

  formatPrice(n: number) { return formatUZS(n); }

  errorLabel(code: string): string {
    const buyerKey = `miniapp.buyer.errors.${code}`;
    if (this.locale.hasKey(buyerKey)) return this.locale.t(buyerKey);
    const commonKey = `miniapp.common.errors.${code}`;
    if (this.locale.hasKey(commonKey)) return this.locale.t(commonKey);
    return this.locale.t('miniapp.common.error_generic');
  }

  async filter(catId: string | null) {
    this.tg.haptic('selection');
    this.selectedCat.set(catId);
    await this.loadProducts(catId);
  }

  add(p: Product) {
    if (!this.shop()) return;
    this.tg.haptic('light');
    this.cart.addItem(this.id, this.shop()!.name, {
      product_id: p.id,
      name: p.name,
      price: p.price,
      photo_path: p.photo_path,
    });
  }
  inc(p: Product) { this.tg.haptic('light'); this.cart.setQty(p.id, this.qtyOf(p.id) + 1); }
  dec(p: Product) { this.tg.haptic('light'); this.cart.setQty(p.id, this.qtyOf(p.id) - 1); }

  private async loadShop() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.api.get<{ shop: ShopDetail; categories: CategoryRow[] }>(`/shops/${this.id}`));
      this.shop.set(res.shop);
      this.categories.set(res.categories);
    } catch (e) {
      const code = (e as { code?: string }).code || 'INTERNAL_ERROR';
      this.loadError.set(code);
      this.tg.haptic('error');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProducts(catId: string | null) {
    this.productsError.set(null);
    try {
      const res = await firstValueFrom(this.api.get<{ products: Product[] }>(`/shops/${this.id}/products`, catId ? { category_id: catId } : undefined));
      this.products.set(res.products);
    } catch (e) {
      this.products.set([]);
      this.productsError.set((e as { code?: string }).code || 'INTERNAL_ERROR');
    }
  }
}
