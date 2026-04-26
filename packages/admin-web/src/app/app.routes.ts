import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '',           pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard',  loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'moderation', loadComponent: () => import('./features/moderation/moderation').then((m) => m.Moderation) },
      { path: 'shops',      loadComponent: () => import('./features/shops/shops-list').then((m) => m.ShopsList) },
      { path: 'shops/:id',  loadComponent: () => import('./features/shops/shop-detail').then((m) => m.ShopDetail) },
      { path: 'orders',     loadComponent: () => import('./features/orders/orders-list').then((m) => m.OrdersList) },
      { path: 'orders/:id', loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetail) },
      { path: 'users',      loadComponent: () => import('./features/users/users-list').then((m) => m.UsersList) },
      { path: 'map',        loadComponent: () => import('./features/stub/stub').then((m) => m.Stub), data: { titleKey: 'map.title' } },
      { path: 'analytics',  loadComponent: () => import('./features/analytics/analytics').then((m) => m.Analytics) },
      { path: 'settings',   loadComponent: () => import('./features/settings/settings').then((m) => m.Settings) },
    ],
  },
  { path: '**', redirectTo: '' },
];
