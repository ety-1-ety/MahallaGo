import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy, Input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, ApiError } from '../../core/api/api.service';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { TPipe } from '../../core/i18n/t.pipe';

interface SellerProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  photo_path: string | null;
  category_id: string | null;
}
interface SellerCategory {
  id: string;
  name_uz: string;
  name_ru: string;
  emoji: string;
}

@Component({
  selector: 'seller-product-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">
        {{ (isEdit() ? 'miniapp.seller.add_product.edit_title' : 'miniapp.seller.add_product.title') | t }}
      </div>
    </header>

    @if (loading()) {
      <div class="card mb-3"><div class="skeleton" style="height:18px;width:60%"></div></div>
    } @else {
      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_photo' | t }}</label>
        <button type="button" class="btn btn-ghost btn-block" (click)="filePicker.click()"
                style="min-height: 120px; flex-direction: column;">
          @if (photoPreview()) {
            <img [src]="photoPreview()" alt="" style="max-height:96px;max-width:100%;border-radius:10px;object-fit:cover" />
            <span class="muted text-sm mt-1">{{ 'miniapp.seller.add_product.field_photo_replace' | t }}</span>
          } @else {
            <span style="font-size:32px">📷</span>
            <span class="muted text-sm">{{ 'miniapp.seller.add_product.field_photo_hint' | t }}</span>
          }
        </button>
        <input #filePicker type="file" accept="image/*" style="display:none" (change)="onFile($event)">
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_name' | t }}</label>
        <input class="input" type="text" [(ngModel)]="name"
               [placeholder]="locale.t('miniapp.seller.add_product.field_name_placeholder')">
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_category' | t }}</label>
        <div class="flex gap-1" style="flex-wrap:wrap">
          @for (c of categories(); track c.id) {
            <button class="chip" [class.chip-primary]="categoryId() === c.id" (click)="categoryId.set(c.id)">
              {{ c.emoji }} {{ locale.current() === 'uz' ? c.name_uz : c.name_ru }}
            </button>
          }
        </div>
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_description' | t }}</label>
        <textarea class="textarea" rows="3" [(ngModel)]="description"
                  [placeholder]="locale.t('miniapp.seller.add_product.field_description_placeholder')"></textarea>
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_price' | t }}</label>
        <input class="input" type="number" inputmode="numeric" [(ngModel)]="price"
               [placeholder]="locale.t('miniapp.seller.add_product.field_price_placeholder')">
      </section>

      <section class="card mb-3">
        <label class="label">{{ 'miniapp.seller.add_product.field_stock' | t }}</label>
        <input class="input" type="number" inputmode="numeric" [(ngModel)]="stock"
               [placeholder]="locale.t('miniapp.seller.add_product.field_stock_placeholder')">
      </section>

      @if (errorMsg(); as msg) {
        <div class="card mt-3" style="border-color: var(--mhs-red)">
          <div class="text-sm" style="color: var(--mhs-red)">{{ msg }}</div>
        </div>
      }

      @if (isEdit()) {
        <button class="btn btn-danger btn-block mt-3" (click)="onDelete()">
          🗑 {{ 'miniapp.seller.add_product.delete_button' | t }}
        </button>
      }
    }
  `,
})
export class ProductForm implements OnInit, OnDestroy {
  @Input() id?: string;

  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly isEdit = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly submitting = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);

  readonly name = signal<string>('');
  readonly description = signal<string>('');
  readonly categoryId = signal<string | null>(null);
  readonly price = signal<number | null>(null);
  readonly stock = signal<number | null>(null);
  readonly photoPreview = signal<string | null>(null);
  private photoFile: File | null = null;

  readonly categories = signal<SellerCategory[]>([]);

  constructor() {
    // MainButton — "Сохранить"
    effect(() => {
      const text = this.locale.t(
        this.submitting()
          ? 'miniapp.seller.add_product.submitting'
          : (this.isEdit() ? 'miniapp.seller.add_product.submit_edit' : 'miniapp.seller.add_product.submit'),
      );
      this.tg.showMainButton(text, () => this.submit(), { active: !this.submitting() });
      this.tg.setMainButtonProgress(this.submitting());
    });
  }

  async ngOnInit() {
    this.tg.showBackButton(() => this.back());
    this.isEdit.set(!!this.id);
    await Promise.all([this.loadCategories(), this.id ? this.loadProduct(this.id) : Promise.resolve()]);
    this.loading.set(false);
  }
  ngOnDestroy() {
    this.tg.hideBackButton();
    this.tg.hideMainButton();
  }

  back() {
    this.tg.haptic('selection');
    this.router.navigateByUrl('/');
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.photoFile = f;
    const reader = new FileReader();
    reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(f);
    this.tg.haptic('selection');
  }

  private buildFormData(): FormData {
    const fd = new FormData();
    fd.append('name', this.name().trim());
    if (this.categoryId()) fd.append('category_id', this.categoryId()!);
    fd.append('description', this.description().trim());
    fd.append('price', String(this.price() ?? 0));
    fd.append('stock', String(this.stock() ?? 0));
    if (this.photoFile) fd.append('photo', this.photoFile);
    return fd;
  }

  async submit() {
    if (!this.name().trim()) { this.errorMsg.set(this.locale.t('miniapp.seller.errors.INVALID_PRODUCT_NAME')); this.tg.haptic('error'); return; }
    const p = Number(this.price());
    if (!Number.isFinite(p) || p < 0) { this.errorMsg.set(this.locale.t('miniapp.seller.errors.INVALID_PRODUCT_PRICE')); this.tg.haptic('error'); return; }
    const s = Number(this.stock());
    if (!Number.isFinite(s) || s < 0) { this.errorMsg.set(this.locale.t('miniapp.seller.errors.INVALID_PRODUCT_STOCK')); this.tg.haptic('error'); return; }

    this.submitting.set(true);
    this.errorMsg.set(null);
    try {
      const fd = this.buildFormData();
      const url = this.isEdit() ? `/products/${this.id}` : '/products';
      const init: RequestInit = {
        method: this.isEdit() ? 'PATCH' : 'POST',
        body: fd,
        credentials: 'include',
      };
      const resp = await fetch(`/api/miniapp/seller${url}`, init);
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        const code = body?.error || `HTTP_${resp.status}`;
        const key = `miniapp.seller.errors.${code}`;
        const msg = this.locale.hasKey(key) ? this.locale.t(key) : (body?.detail || this.locale.t('miniapp.common.error_generic'));
        this.errorMsg.set(msg);
        this.tg.haptic('error');
        return;
      }
      this.tg.haptic('success');
      this.router.navigateByUrl('/');
    } catch {
      this.errorMsg.set(this.locale.t('miniapp.common.error_network'));
      this.tg.haptic('error');
    } finally {
      this.submitting.set(false);
    }
  }

  async onDelete() {
    if (!this.id) return;
    if (!confirm(this.locale.t('miniapp.seller.add_product.delete_confirm'))) return;
    this.tg.haptic('warning');
    try {
      await firstValueFrom(this.api.delete(`/products/${this.id}`));
      this.tg.haptic('success');
      this.router.navigateByUrl('/');
    } catch (e) {
      this.errorMsg.set((e as ApiError).detail || this.locale.t('miniapp.common.error_generic'));
      this.tg.haptic('error');
    }
  }

  private async loadCategories() {
    try {
      const res = await firstValueFrom(this.api.get<{ categories: SellerCategory[] }>('/products/categories'));
      this.categories.set(res.categories);
    } catch { /* keep empty */ }
  }
  private async loadProduct(id: string) {
    try {
      const res = await firstValueFrom(this.api.get<{ product: SellerProduct }>(`/products/${id}`));
      this.name.set(res.product.name);
      this.description.set(res.product.description ?? '');
      this.categoryId.set(res.product.category_id);
      this.price.set(res.product.price);
      this.stock.set(res.product.stock);
      if (res.product.photo_path) this.photoPreview.set(`/photos/${res.product.photo_path}`);
    } catch (e) {
      this.errorMsg.set(this.locale.t('miniapp.seller.errors.PRODUCT_NOT_FOUND'));
    }
  }
}
