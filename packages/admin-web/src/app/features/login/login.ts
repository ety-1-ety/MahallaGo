import { Component, ChangeDetectionStrategy, inject, signal, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatProgressSpinnerModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <mat-card class="login-card">
        <mat-card-content>
          <div class="logo-wrap">
            <div class="logo-dot"></div>
          </div>
          <h1 class="title">{{ 'login.title' | t }}</h1>
          <p class="subtitle">{{ 'login.subtitle' | t }}</p>

          <div class="widget-wrap" #widget></div>

          @if (loading()) {
            <div class="loading">
              <mat-spinner diameter="32"></mat-spinner>
              <span>{{ 'common.loading' | t }}</span>
            </div>
          }

          @if (errorKey(); as ek) {
            <div class="err">{{ ek | t }}</div>
          }

          <div class="actions">
            <button mat-button (click)="i18n.toggle()">
              {{ i18n.locale() === 'ru' ? 'OʻZ' : 'РУ' }}
            </button>
            <button mat-button (click)="theme.toggle()">
              {{ theme.mode() === 'dark' ? '☀' : '🌙' }}
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { min-height: 100vh; display: grid; place-items: center; padding: 16px;
            background: linear-gradient(135deg, rgba(30,181,58,0.08), rgba(0,153,181,0.08)); }
    .login-card { max-width: 440px; width: 100%; padding: 24px; }
    .logo-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
    .logo-dot { width: 64px; height: 64px; border-radius: 16px; background: linear-gradient(135deg, #1eb53a, #0099b5); }
    .title { font-size: 22px; text-align: center; margin: 0 0 6px; }
    .subtitle { color: var(--mat-sys-on-surface-variant); text-align: center; margin: 0 0 24px; }
    .widget-wrap { display: flex; justify-content: center; min-height: 56px; }
    .loading { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 16px; }
    .err { color: var(--mat-sys-error); margin-top: 12px; text-align: center; }
    .actions { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
  `],
})
export class Login implements AfterViewInit {
  @ViewChild('widget', { static: true }) widget!: ElementRef<HTMLDivElement>;

  protected readonly auth   = inject(AuthService);
  protected readonly i18n   = inject(I18nService);
  protected readonly theme  = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  ngAfterViewInit() {
    // Регистрируем глобальный callback для Telegram Login Widget
    (window as unknown as { onTelegramAuth?: (data: Record<string, unknown>) => void }).onTelegramAuth =
      (data) => this.handleAuth(data);

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', environment.botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    this.widget.nativeElement.appendChild(script);
  }

  private async handleAuth(data: Record<string, unknown>) {
    this.loading.set(true);
    this.errorKey.set(null);
    const res = await this.auth.loginWithTelegram(data);
    this.loading.set(false);
    if (res.ok) {
      this.router.navigate(['/dashboard']);
    } else if (res.error === 'NOT_ADMIN') {
      this.errorKey.set('login.no_access');
    } else {
      this.errorKey.set('login.failed');
    }
  }
}
