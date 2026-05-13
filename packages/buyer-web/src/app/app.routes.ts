import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then(m => m.Home) },
  { path: 'shop/:id', loadComponent: () => import('./features/shop/shop').then(m => m.ShopPage) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart').then(m => m.CartPage) },
  { path: 'checkout', loadComponent: () => import('./features/checkout/checkout').then(m => m.CheckoutPage) },
  { path: 'orders', loadComponent: () => import('./features/orders/orders').then(m => m.OrdersPage) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
