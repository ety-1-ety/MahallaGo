import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUser {
  id: string;
  telegram_id: number;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  language_code: string;
  is_admin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<AdminUser | null>(null);
  readonly checking = signal(true);

  async loginWithTelegram(authData: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ user: AdminUser }>(`${environment.apiUrl}/api/auth/telegram`, authData, {
          withCredentials: true,
        }),
      );
      this.user.set(res.user as AdminUser);
      return { ok: true };
    } catch (err: unknown) {
      const e = err as { error?: { error?: string }, status?: number };
      return { ok: false, error: e.error?.error || `HTTP_${e.status}` };
    }
  }

  async fetchMe(): Promise<AdminUser | null> {
    this.checking.set(true);
    try {
      const me = await firstValueFrom(
        this.http.get<AdminUser>(`${environment.apiUrl}/api/auth/me`, { withCredentials: true }),
      );
      this.user.set(me);
      return me;
    } catch {
      this.user.set(null);
      return null;
    } finally {
      this.checking.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/api/auth/logout`, {}, { withCredentials: true }),
      );
    } catch { /* ignore */ }
    this.user.set(null);
  }
}
