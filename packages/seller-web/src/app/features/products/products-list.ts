import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { formatUZS } from '../../core/format/format';

interface SellerProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  photo_path: string | null;
  category_id: string | null;
  category_name_ru: string | null;
  category_name_uz: string | null;
  category_emoji: string | null;
}
interface SellerCategory {
  id: string;
  name_uz: string;
  name_ru: string;
  emoji: string;
  product_count: number;
}

@Component({
  selector: 'seller-products-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <div class="title">{{ 'miniapp.seller.products.title' | t }}</div>
      <button class="btn btn-ghost" style="min-height:36px;padding:0 10px" (click)="goSettings()">
        {{ locale.current() === 'uz' ? 'UZ' : 'RU' }}
      </button>
    </header>

    @if (total() > 0) {
      <div class="muted text-sm mb-2">
        {{ 'miniapp.seller.products.count' | t: { count: total() } }}
      </div>
    }

    <input class="input mb-3" [(ngModel)]="search"
           (ngModelChange)="onSearch()"
           [placeholder]="locale.t('miniapp.seller.products.search_placeholder')">

    <div class="flex gap-1 mb-3" style="overflow-x:auto;padding-bottom:6px">
      <button class="chip" [class.chip-primary]="!selectedCat()" (click)="filter(null)">
        {{ 'miniapp.seller.products.filter_all' | t }}
      </button>
      @for (c of categories(); track c.id) {
        <button class="chip" [class.chip-primary]="selectedCat() === c.id" (click)="filter(c.id)">
          {{ c.emoji }} {{ catName(c) }} · {{ c.product_count }}
        </button>
      }
    </div>

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
        <button class="btn btn-primary btn-block mt-3" (click)="retry()">
          {{ 'miniapp.common.retry' | t }}
        </button>
      </div>
    } @else if (products().length === 0) {
      <div class="empty">
        <div class="icon">📦</div>
        <div class="h2">{{ 'miniapp.seller.products.empty_title' | t }}</div>
        <div class="muted">{{ 'miniapp.seller.products.empty_subtitle' | t }}</div>
        <button class="btn btn-primary btn-block mt-3" (click)="addNew()">
          {{ 'miniapp.seller.products.add_button' | t }}
        </button>
      </div>
    } @else {
      <div class="list">
        @for (p of products(); track p.id) {
          <article class="card tappable" (click)="edit(p.id)">
            <div class="flex gap-2 items-center">
              <div class="grow">
                <div class="semibold">{{ p.name }}</div>
                <div class="muted text-sm mt-1">
                  @if (p.category_emoji) { <span>{{ p.category_emoji }} </span> }
                  {{ locale.current() === 'uz' ? p.category_name_uz : p.category_name_ru }}
                </div>
                <div class="flex gap-1 mt-2">
                  <span class="chip">{{ formatPrice(p.price) }}</span>
                  <span class="chip"
                        [class.chip-primary]="p.stock > 5"
                        [class.chip-danger]="p.stock === 0">
                    {{ p.stock === 0
                       ? ('miniapp.seller.products.stock_out' | t)
                       : ('miniapp.seller.products.stock_label' | t: { stock: p.stock }) }}
                  </span>
                </div>
              </div>
            </div>
          </article>
        }
      </div>
    }
  `,
})
export class ProductsList implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly locale = inject(LocaleService);

  readonly products = signal<SellerProduct[]>([]);
  readonly categories = signal<SellerCategory[]>([]);
  readonly selectedCat = signal<string | null>(null);
  readonly search = signal<string>('');
  readonly total = signal<number>(0);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // MainButton реактивно реагирует на смену языка (locale.version() в зависимости).
    effect(() => {
      void this.locale.version();
      this.tg.showMainButton(this.locale.t('miniapp.seller.products.add_button'), () => this.addNew());
    });
  }

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();
  }
  ngOnDestroy() {
    this.tg.hideMainButton();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  catName(c: SellerCategory) {
    return this.locale.current() === 'uz' ? c.name_uz : c.name_ru;
  }

  formatPrice(n: number) { return formatUZS(n); }
  addNew() { this.tg.haptic('light'); this.router.navigateByUrl('/products/new'); }
  edit(id: string) { this.tg.haptic('selection'); this.router.navigate(['/products', id, 'edit']); }
  goSettings() { this.tg.haptic('selection'); this.router.navigateByUrl('/settings'); }

  filter(catId: string | null) {
    this.tg.haptic('selection');
    this.selectedCat.set(catId);
    this.loadProducts();
  }

  onSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadProducts(), 300);
  }

  private async loadCategories() {
    try {
      const res = await firstValueFrom(this.api.get<{ categories: SellerCategory[] }>('/products/categories'));
      this.categories.set(res.categories);
    } catch { /* ok */ }
  }
  retry() { this.tg.haptic('selection'); this.loadProducts(); }

  private async loadProducts() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const params: Record<string, string | number | boolean> = { page: 1, per_page: 50 };
      if (this.selectedCat()) params['category_id'] = this.selectedCat()!;
      const s = this.search().trim();
      if (s) params['search'] = s;
      const res = await firstValueFrom(this.api.get<{ products: SellerProduct[]; total: number }>('/products', params));
      this.products.set(res.products);
      this.total.set(res.total);
    } catch (e) {
      this.products.set([]);
      this.loadError.set((e as { code?: string }).code || 'INTERNAL_ERROR');
      this.tg.haptic('error');
    } finally {
      this.loading.set(false);
    }
  }
}
