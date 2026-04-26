import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { TPipe } from '../../core/i18n/t.pipe';

interface NavItem { path: string; icon: string; titleKey: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatMenuModule,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav #drawer
                   class="sidenav"
                   [mode]="isMobile() ? 'over' : 'side'"
                   [opened]="!isMobile()"
                   fixedInViewport>
        <div class="brand">
          <div class="logo-dot"></div>
          <div class="brand-text">
            <div class="brand-title">{{ 'app.title' | t }}</div>
            <div class="brand-sub">{{ 'app.subtitle' | t }}</div>
          </div>
        </div>

        <mat-nav-list>
          @for (n of navItems; track n.path) {
            <a mat-list-item
               [routerLink]="n.path"
               routerLinkActive="active"
               (click)="isMobile() && drawer.close()">
              <mat-icon matListItemIcon>{{ n.icon }}</mat-icon>
              <span matListItemTitle>{{ n.titleKey | t }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar color="primary" class="toolbar">
          @if (isMobile()) {
            <button mat-icon-button (click)="drawer.toggle()">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="grow"></span>

          <button mat-icon-button (click)="i18n.toggle()" [attr.aria-label]="'common.language_toggle' | t">
            <span class="lang-badge">{{ i18n.locale().toUpperCase() }}</span>
          </button>

          <button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="'common.theme_toggle' | t">
            <mat-icon>{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>

          <button mat-icon-button [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu>
            <div mat-menu-item disabled>
              <mat-icon>person</mat-icon>
              <span>{{ auth.user()?.first_name || '—' }}</span>
            </div>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>{{ 'common.logout' | t }}</span>
            </button>
          </mat-menu>
        </mat-toolbar>

        <main class="main-area">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .shell { height: 100vh; }
    .sidenav { width: 260px; border-right: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface); }
    .brand { display: flex; align-items: center; gap: 12px; padding: 20px 16px 16px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .logo-dot { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #1eb53a, #0099b5); flex-shrink: 0; }
    .brand-title { font-weight: 700; font-size: 16px; }
    .brand-sub   { font-size: 12px; color: var(--mat-sys-on-surface-variant); }
    mat-nav-list a.active { background: var(--mat-sys-secondary-container); }
    .toolbar { display: flex; align-items: center; gap: 4px; }
    .grow { flex: 1 1 auto; }
    .lang-badge { font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
    .main-area { padding: 0; min-height: calc(100vh - 64px); }
  `],
})
export class Shell {
  protected readonly i18n   = inject(I18nService);
  protected readonly theme  = inject(ThemeService);
  protected readonly auth   = inject(AuthService);
  private  readonly router = inject(Router);

  protected readonly navItems: NavItem[] = [
    { path: 'dashboard',  icon: 'dashboard',          titleKey: 'nav.dashboard' },
    { path: 'moderation', icon: 'gavel',              titleKey: 'nav.moderation' },
    { path: 'shops',      icon: 'storefront',         titleKey: 'nav.shops' },
    { path: 'orders',     icon: 'receipt_long',       titleKey: 'nav.orders' },
    { path: 'users',      icon: 'group',              titleKey: 'nav.users' },
    { path: 'map',        icon: 'map',                titleKey: 'nav.map' },
    { path: 'analytics',  icon: 'analytics',          titleKey: 'nav.analytics' },
    { path: 'settings',   icon: 'settings',           titleKey: 'nav.settings' },
  ];

  protected readonly isMobile = signal(window.matchMedia('(max-width: 1023px)').matches);

  constructor() {
    window.matchMedia('(max-width: 1023px)').addEventListener('change', (e) => this.isMobile.set(e.matches));
  }

  protected async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
