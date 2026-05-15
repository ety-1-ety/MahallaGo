import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CartService } from '../core/cart/cart.service';
import { TelegramService } from '../core/telegram/telegram.service';
import { TPipe } from '../core/i18n/t.pipe';

// Постоянная нижняя навигация (Главная / Корзина / Заказы).
// Рендерится в App только для авторизованного состояния, поверх контента,
// над нативной Telegram MainButton (она отдельный нативный бар ниже webview).
@Component({
  selector: 'buyer-tabbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tabbar">
      <a class="tabbar__item" routerLink="/" routerLinkActive="is-active"
         [routerLinkActiveOptions]="{ exact: true }" (click)="tap()">
        <span class="tabbar__icon">📍</span>
        <span class="tabbar__label">{{ 'miniapp.buyer.tabs.home' | t }}</span>
      </a>
      <a class="tabbar__item" routerLink="/cart" routerLinkActive="is-active" (click)="tap()">
        <span class="tabbar__icon">
          🛒
          @if (cart.itemsCount() > 0) {
            <span class="tabbar__badge">{{ cart.itemsCount() }}</span>
          }
        </span>
        <span class="tabbar__label">{{ 'miniapp.buyer.tabs.cart' | t }}</span>
      </a>
      <a class="tabbar__item" routerLink="/orders" routerLinkActive="is-active" (click)="tap()">
        <span class="tabbar__icon">📦</span>
        <span class="tabbar__label">{{ 'miniapp.buyer.tabs.orders' | t }}</span>
      </a>
    </nav>
  `,
})
export class TabBar {
  readonly cart = inject(CartService);
  private readonly tg = inject(TelegramService);
  tap() { this.tg.haptic('selection'); }
}
