import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { LocaleService } from './core/i18n/locale.service';
import { TPipe } from './core/i18n/t.pipe';

@Component({
  selector: 'buyer-root',
  standalone: true,
  imports: [RouterOutlet, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.error()) {
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="h2">{{ 'miniapp.common.auth_error' | t }}</div>
        <div class="muted text-sm">{{ auth.error() }}</div>
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
}
