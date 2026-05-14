import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressSpinnerModule, TPipe,
  ],
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

          <form (ngSubmit)="submit()" class="form">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'login.username' | t }}</mat-label>
              <input matInput type="text" name="login" [(ngModel)]="login" autocomplete="username" required>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'login.password' | t }}</mat-label>
              <input matInput type="password" name="password" [(ngModel)]="password" autocomplete="current-password" required>
            </mat-form-field>

            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'login.submit' | t }}
              }
            </button>
          </form>

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
    .page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
      position: relative;
      overflow: hidden;
    }
    .page::before {
      content: '';
      position: absolute; inset: -20%;
      z-index: 0;
      background:
        radial-gradient(closest-side at 20% 30%, rgba(30,181,58,0.40), transparent 70%),
        radial-gradient(closest-side at 80% 70%, rgba(0,220,240,0.35),  transparent 70%),
        radial-gradient(closest-side at 60% 20%, rgba(120,80,255,0.28), transparent 70%);
      filter: blur(60px);
      animation: mgo-pulse 12s ease-in-out infinite alternate;
    }
    @keyframes mgo-pulse {
      0%   { transform: scale(1)   rotate(0deg); }
      100% { transform: scale(1.08) rotate(8deg); }
    }
    .login-card {
      position: relative;
      z-index: 1;
      max-width: 440px; width: 100%;
      padding: 28px 28px 18px !important;
      border: 1px solid var(--mgo-border-strong) !important;
      box-shadow: 0 30px 80px rgba(0,0,0,0.35), 0 0 60px rgba(30,181,58,0.18) !important;
    }
    .logo-wrap { display: flex; justify-content: center; margin-bottom: 18px; }
    .logo-dot {
      width: 72px; height: 72px;
      border-radius: 22px;
      background: conic-gradient(from 200deg, #1eb53a, #00dcf0, #b388ff, #1eb53a);
      box-shadow: 0 0 40px rgba(30,181,58,0.55), inset 0 0 20px rgba(255,255,255,0.18);
      animation: mgo-spin 14s linear infinite;
    }
    @keyframes mgo-spin {
      to { transform: rotate(360deg); }
    }
    .title {
      font-size: 24px; font-weight: 700;
      letter-spacing: -0.02em;
      text-align: center; margin: 0 0 6px;
      background: linear-gradient(120deg, #1eb53a, #00dcf0, #b388ff);
      -webkit-background-clip: text; background-clip: text;
      color: transparent;
    }
    .subtitle { color: var(--mgo-text-muted); text-align: center; margin: 0 0 24px; font-size: 14px; }
    .form { display: flex; flex-direction: column; gap: 6px; }
    .form button { height: 48px; font-size: 15px; }
    .err {
      color: var(--mat-sys-error);
      background: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 35%, transparent);
      border-radius: 10px;
      padding: 10px 12px;
      margin-top: 12px; text-align: center; font-size: 13px;
    }
    .actions { display: flex; justify-content: center; gap: 4px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--mgo-border); }
  `],
})
export class Login {
  protected readonly auth   = inject(AuthService);
  protected readonly i18n   = inject(I18nService);
  protected readonly theme  = inject(ThemeService);
  private readonly router = inject(Router);

  protected login = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  async submit() {
    if (!this.login || !this.password) return;
    this.loading.set(true);
    this.errorKey.set(null);
    const res = await this.auth.loginWithPassword(this.login, this.password);
    this.loading.set(false);
    if (res.ok) {
      this.router.navigate(['/dashboard']);
    } else if (res.error === 'INVALID_CREDENTIALS') {
      this.errorKey.set('login.invalid_credentials');
    } else {
      this.errorKey.set('login.failed');
    }
  }
}
