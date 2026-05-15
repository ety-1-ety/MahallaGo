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
    // Текущая корзина этого магазина или новая. Пустая корзина = _cart() === null,
    // поэтому нельзя полагаться на мутацию существующего объекта.
    const prev = this._cart();
    const base = prev && prev.shop_id === shopId
      ? prev
      : { shop_id: shopId, shop_name: shopName, items: [] as CartItem[], updated_at: Date.now() };

    const addQty = item.qty ?? 1;
    const existing = base.items.find((i) => i.product_id === item.product_id);
    const items = existing
      ? base.items.map((i) =>
          i.product_id === item.product_id ? { ...i, qty: i.qty + addQty } : i)
      : [...base.items, { ...item, qty: addQty }];

    this._cart.set({ shop_id: shopId, shop_name: shopName, items, updated_at: Date.now() });
    this._shopId.set(shopId);
    this.markActive(shopId);
  }

  setQty(productId: string, qty: number) {
    const c = this._cart();
    if (!c) return;
    if (!c.items.some((i) => i.product_id === productId)) return;
    const items = qty <= 0
      ? c.items.filter((i) => i.product_id !== productId)
      : c.items.map((i) => (i.product_id === productId ? { ...i, qty } : i));
    if (items.length === 0) {
      this.clear(c.shop_id);
      return;
    }
    this._cart.set({ ...c, items, updated_at: Date.now() });
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
