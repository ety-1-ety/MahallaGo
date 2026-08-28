import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, params?: Record<string, string | number | undefined>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          httpParams = httpParams.set(k, String(v));
        }
      }
    }
    return this.http.get<T>(`${this.base}${path}`, { params: httpParams, withCredentials: true });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body ?? {}, { withCredentials: true });
  }

  // KPIs / dashboard
  dashboardKpis()         { return this.get<DashboardKpis>('/dashboard/kpis'); }
  ordersByHour()          { return this.get<{ hour: number; count: number }[]>('/dashboard/orders-by-hour'); }
  gmvTrend()              { return this.get<{ day: string; gmv: number }[]>('/dashboard/gmv-trend'); }

  // Shops
  pendingShops()                                                                  { return this.get<PendingShop[]>('/shops/pending'); }
  shops(params: { status?: string; q?: string; page?: number; per_page?: number }) { return this.get<Page<ShopRow>>('/shops', params); }
  shop(id: string)                                                                { return this.get<ShopDetail>(`/shops/${id}`); }
  shopProducts(id: string)                                                        { return this.get<ProductRow[]>(`/shops/${id}/products`); }
  approveShop(id: string)                                                         { return this.post<{ shop: ShopRow }>(`/shops/${id}/approve`); }
  rejectShop(id: string, reason: string)                                          { return this.post<{ shop: ShopRow }>(`/shops/${id}/reject`,  { reason }); }
  suspendShop(id: string, reason: string)                                         { return this.post<{ shop: ShopRow }>(`/shops/${id}/suspend`, { reason }); }

  // Orders
  orders(params: { status?: string; shop_id?: string; page?: number; per_page?: number }) {
    return this.get<Page<OrderRow>>('/orders', params);
  }
  order(id: string) {
    return this.get<{ order: OrderDetailDto; items: OrderItem[]; timeline: StatusEvent[] }>(`/orders/${id}`);
  }

  // Users
  users(params: { q?: string; page?: number; per_page?: number }) {
    return this.get<{ items: UserRow[] }>('/users', params);
  }
  markAdmin(tgId: number, isAdmin: boolean) {
    return this.post<{ user: UserRow }>(`/users/${tgId}/mark-admin`, { is_admin: isAdmin });
  }

  // Analytics
  shopsGrowth()    { return this.get<ShopsGrowthPoint[]>('/analytics/shops-growth'); }
  topCategories()  { return this.get<TopCategoryRow[]>('/analytics/top-categories'); }
  activeShopsMap() { return this.get<MapShopRow[]>('/analytics/active-shops-map'); }

  // Settings
  admins()         { return this.get<AdminRow[]>('/settings/admins'); }
  whitelist()      { return this.get<{ admin_tg_ids: number[] }>('/settings/whitelist'); }
}

// - Типы ответов API -
export interface DashboardKpis {
  shops:  { active: number; pending: number; suspended: number; rejected: number };
  orders: { active: number; completed: number; cancelled: number; today: number; this_week: number };
  gmv:    { today: number; this_month: number };
  users:  { total: number };
}

export interface ShopRow {
  id: string;
  name: string;
  slug: string;
  status: 'pending_approval' | 'active' | 'rejected' | 'suspended' | 'closed';
  category?: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  created_at: string;
  owner_telegram_id: number;
  owner_first_name?: string;
  owner_username?: string;
}
export interface PendingShop extends ShopRow {
  description?: string;
  photo_file_id?: string;
}
export interface ShopDetail extends ShopRow {
  description?: string;
  photo_file_id?: string;
  min_order_amount: number;
  max_order_amount: number | null;
  delivery_fee: number;
  free_delivery_from: number | null;
  delivery_radius_m: number;
  is_accepting_orders: boolean;
  rejection_reason?: string;
}
export interface ProductRow {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  photo_file_id?: string;
  category_name_ru?: string;
  category_name_uz?: string;
  emoji?: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'ready'
  | 'delivering'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface OrderRow {
  id: string;
  number: number;
  buyer_id: string;
  buyer_telegram_id: number;
  buyer_username?: string;
  buyer_first_name?: string;
  buyer_last_name?: string;
  buyer_phone?: string;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  shop_phone?: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  delivery_address: string;
  delivery_lat: number;
  delivery_lng: number;
  distance_m: number | null;
  payment_method: 'cash';
  status: OrderStatus;
  rejection_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type OrderDetailDto = OrderRow;

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
}

export interface StatusEvent {
  id: string;
  order_id: string;
  prev_status: OrderStatus | null;
  new_status: OrderStatus;
  actor_id: string | null;
  actor_telegram_id?: number;
  actor_username?: string;
  actor_first_name?: string;
  actor_is_admin?: boolean;
  reason?: string;
  created_at: string;
}

export interface UserRow {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  language_code: 'uz' | 'ru';
  is_admin: boolean;
  is_blocked: boolean;
  last_seen_at?: string;
  created_at: string;
}

export interface ShopsGrowthPoint {
  day: string;
  shops_registered: number;
  shops_approved: number;
}

export interface TopCategoryRow {
  id: string;
  slug: string;
  name_ru: string;
  name_uz: string;
  emoji?: string;
  shops: number;
  products: number;
  revenue: number;
}

export interface MapShopRow {
  id: string;
  name: string;
  category?: string;
  slug: string;
  lat: number;
  lng: number;
  is_accepting_orders: boolean;
}

export interface AdminRow {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code: 'uz' | 'ru';
  is_blocked: boolean;
  last_seen_at?: string;
  created_at: string;
}
