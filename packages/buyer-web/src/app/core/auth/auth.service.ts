import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { TelegramService } from '../telegram/telegram.service';
import { LocaleService, Locale } from '../i18n/locale.service';

export interface BuyerProfile {
  id: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  language: Locale;
  phone: string | null;
}

interface AuthInitResponse {
  user: BuyerProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tg = inject(TelegramService);
  private readonly locale = inject(LocaleService);

  readonly profile = signal<BuyerProfile | null>(null);
  readonly error = signal<string | null>(null);
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
      if (res.user.language && (res.user.language === 'uz' || res.user.language === 'ru')) {
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
    } catch { /* язык применился локально; синхронизация может догнать позже */ }
  }
}
