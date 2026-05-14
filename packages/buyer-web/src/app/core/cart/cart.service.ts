import { Injectable, signal, computed, effect } from '@angular/core';

// ─────────────────────────────────────────────────────────────────────
// CartService
//
// Корзина живёт в localStorage, ключ "mgo.cart.<shop_id>".
// В Mini App покупатель видит карточку магазина и наполняет КОРЗИНУ ОДНОГО МАГАЗИНА.
// Если переключился на другой магазин — старая корзина сохраняется по своему ключу
// (мы не очищаем автоматически), но активная корзина — это всегда корзина текущего открытого магазина.
//
// Структура:
//   cart = { shop_id, shop_name, items: [{ product_id, name, price, photo_path, qty }] }
// ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  product_id: string;
  name: string;
  price: number;
  photo_path?: string | null;
  qty: number;
}
export interface Cart {
  shop_id: string;
  shop_name: string;
  items: CartItem[];
  updated_at: number;
}

const KEY_PREFIX = 'mgo.cart.';
const ACTIVE_KEY = 'mgo.cart.active';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _shopId = signal<string | null>(null);
  private readonly _cart = signal<Cart | null>(null);

  readonly cart = computed<Cart | null>(() => this._cart());
  readonly itemsCount = computed(() =>
    (this._cart()?.items.reduce((s, i) => s + i.qty, 0)) ?? 0,
  );
  readonly subtotal = computed(() =>
    (this._cart()?.items.reduce((s, i) => s + i.qty * i.price, 0)) ?? 0,
  );

  constructor() {
    try {
      const id = localStorage.getItem(ACTIVE_KEY);
      if (id) this.loadShop(id);
    } catch { /* storage may be blocked */ }

    // Авто-персист при изменениях. localStorage может бросить QuotaExceededError
    // (особенно на iOS Safari Private Mode), молча проглатываем — корзина
    // продолжит жить in-memory в текущей сессии.
    effect(() => {
      const c = this._cart();
      if (!c) return;
      try {
        localStorage.setItem(KEY_PREFIX + c.shop_id, JSON.stringify(c));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[cart] localStorage write failed:', (e as Error)?.message);
      }
    });
  }

  loadShop(shopId: string): Cart | null {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + shopId);
      if (!raw) {
        this._shopId.set(shopId);
        this._cart.set(null);
        return null;
      }
      const parsed = JSON.parse(raw) as Cart;
      this._shopId.set(shopId);
      this._cart.set(parsed);
      this.markActive(shopId);
      return parsed;
    } catch {
      this._shopId.set(shopId);
      this._cart.set(null);
      return null;
    }
  }

  qtyOf(productId: string): number {
    return this._cart()?.items.find((i) => i.product_id === productId)?.qty ?? 0;
  }

  addItem(shopId: string, shopName: string, item: Omit<CartItem, 'qty'> & { qty?: number }) {
    const desiredShop = this._shopId();
    if (desiredShop && desiredShop !== shopId) {
      // переключаемся на другой магазин — старую корзину сохранили эффектом, теперь свежая.
      this.loadShop(shopId);
    }
    const cur = this._cart() ?? { shop_id: shopId, shop_name: shopName, items: [], updated_at: Date.now() };
    if (cur.shop_id !== shopId) {
      // редкий случай: ключ не подгрузился — начинаем с нуля.
      this._cart.set({ shop_id: shopId, shop_name: shopName, items: [], updated_at: Date.now() });
    }
    const c = this._cart()!;
    const existing = c.items.find((i) => i.product_id === item.product_id);
    if (existing) {
      existing.qty += item.qty ?? 1;
    } else {
      c.items.push({ ...item, qty: item.qty ?? 1 });
    }
    this._cart.set({ ...c, shop_name: shopName, updated_at: Date.now() });
    this._shopId.set(shopId);
    this.markActive(shopId);
  }

  setQty(productId: string, qty: number) {
    const c = this._cart();
    if (!c) return;
    const it = c.items.find((i) => i.product_id === productId);
    if (!it) return;
    if (qty <= 0) {
      c.items = c.items.filter((i) => i.product_id !== productId);
    } else {
      it.qty = qty;
    }
    this._cart.set({ ...c, items: [...c.items], updated_at: Date.now() });
    if (c.items.length === 0) this.clear(c.shop_id);
  }

  removeItem(productId: string) {
    this.setQty(productId, 0);
  }

  clear(shopId?: string) {
    const id = shopId ?? this._shopId();
    if (id) {
      try { localStorage.removeItem(KEY_PREFIX + id); } catch { /* noop */ }
    }
    this._cart.set(null);
  }

  private markActive(shopId: string) {
    try { localStorage.setItem(ACTIVE_KEY, shopId); } catch { /* noop */ }
  }
}
