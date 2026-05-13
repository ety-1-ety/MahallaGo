import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { TelegramService } from '../telegram/telegram.service';
import { LocaleService, Locale } from '../i18n/locale.service';

export interface SellerProfile {
  id: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  language: Locale;
  phone: string | null;
}
export interface SellerShop {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_accepting_orders: boolean;
  min_order_amount: number;
  max_order_amount: number | null;
  delivery_fee: number;
  free_delivery_from: number | null;
  delivery_radius_m: number;
}

interface AuthInitResponse {
  user: SellerProfile;
  shop: SellerShop;
}

export type AuthErrorKind = 'NO_INIT_DATA' | 'NO_SHOP' | 'SHOP_INACTIVE' | 'USER_BLOCKED' | 'AUTH_FAILED' | string;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly locale = inject(LocaleService);

  readonly profile = signal<SellerProfile | null>(null);
  readonly shop = signal<SellerShop | null>(null);
  readonly error = signal<AuthErrorKind | null>(null);
  readonly initialized = signal<boolean>(false);

  async init(): Promise<void> {
    const initData = this.tg.initData;
    if (!initData) {
      this.error.set('NO_INIT_DATA');
      this.initialized.set(true);
      return;
    }
    try {
      const res = await firstValueFrom(this.api.post<AuthInitResponse>('/auth/init', { initData }));
      this.profile.set(res.user);
      this.shop.set(res.shop);
      if (res.user.language === 'uz' || res.user.language === 'ru') {
        this.locale.setLanguage(res.user.language);
      }
      this.error.set(null);
    } catch (e) {
      this.error.set((e as { code?: string }).code || 'AUTH_FAILED');
    } finally {
      this.initialized.set(true);
    }
  }

  async changeLanguage(lang: Locale) {
    this.locale.setLanguage(lang);
    try {
      await firstValueFrom(this.api.post<{ ok: boolean }>('/me/language', { lang }));
      const cur = this.profile();
      if (cur) this.profile.set({ ...cur, language: lang });
    } catch { /* keep local language; sync later */ }
  }
}
