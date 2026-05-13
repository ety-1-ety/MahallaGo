import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/products/products-list').then(m => m.ProductsList) },
  { path: 'products/new', loadComponent: () => import('./features/product-form/product-form').then(m => m.ProductForm) },
  { path: 'products/:id/edit', loadComponent: () => import('./features/product-form/product-form').then(m => m.ProductForm) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
