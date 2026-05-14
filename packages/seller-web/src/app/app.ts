import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { LocaleService } from './core/i18n/locale.service';
import { TPipe } from './core/i18n/t.pipe';

@Component({
  selector: 'seller-root',
  standalone: true,
  imports: [RouterOutlet, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errKind() === 'NO_SHOP') {
      <div class="empty">
        <div class="icon">🏪</div>
        <div class="h1">{{ 'miniapp.seller.auth.no_shop_title' | t }}</div>
        <div class="muted">{{ 'miniapp.seller.auth.no_shop_subtitle' | t }}</div>
        <a class="btn btn-primary btn-block mt-3" href="https://t.me/MahallaGo_SellerBot" target="_blank" rel="noopener">
          {{ 'miniapp.seller.auth.open_bot' | t }}
        </a>
      </div>
    } @else if (errKind() === 'SHOP_INACTIVE') {
      <div class="empty">
        <div class="icon">⛔</div>
        <div class="h1">{{ 'miniapp.seller.auth.shop_inactive_title' | t }}</div>
        <div class="muted">{{ 'miniapp.seller.auth.shop_inactive_subtitle' | t }}</div>
      </div>
    } @else if (auth.error()) {
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="h2">{{ 'miniapp.common.auth_error' | t }}</div>
        <div class="muted text-sm">{{ errorDetail() }}</div>
      </div>
    } @else if (!auth.initialized() || !locale.ready()) {
      <div class="empty">
        <div class="icon">⏳</div>
        <div class="muted">{{ 'miniapp.common.loading' | t }}</div>
      </div>
    } @else {
      <main class="page fade-enter">
        <router-outlet />
      </main>
    }
  `,
})
export class App {
  readonly auth = inject(AuthService);
  readonly locale = inject(LocaleService);
  readonly errKind = computed(() => this.auth.error());
  readonly errorDetail = computed(() => {
    const code = this.auth.error();
    if (!code) return '';
    const key = `miniapp.common.errors.${code}`;
    void this.locale.version();
    return this.locale.hasKey(key) ? this.locale.t(key) : code;
  });
}
