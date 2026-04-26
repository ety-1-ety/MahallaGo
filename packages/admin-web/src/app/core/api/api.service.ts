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
    return this.http.get<T>(`${this.base}/api${path}`, { params: httpParams });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}/api${path}`, body ?? {});
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
}

// ─── Типы ответов API ────────────────────────────────────────────
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
