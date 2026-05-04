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
    .page { min-height: 100vh; display: grid; place-items: center; padding: 16px;
            background: linear-gradient(135deg, rgba(30,181,58,0.08), rgba(0,153,181,0.08)); }
    .login-card { max-width: 440px; width: 100%; padding: 24px; }
    .logo-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
    .logo-dot { width: 64px; height: 64px; border-radius: 16px; background: linear-gradient(135deg, #1eb53a, #0099b5); }
    .title { font-size: 22px; text-align: center; margin: 0 0 6px; }
    .subtitle { color: var(--mat-sys-on-surface-variant); text-align: center; margin: 0 0 24px; }
    .form { display: flex; flex-direction: column; gap: 6px; }
    .form button { height: 44px; }
    .err { color: var(--mat-sys-error); margin-top: 12px; text-align: center; }
    .actions { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
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
