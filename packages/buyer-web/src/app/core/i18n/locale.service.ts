import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Locale = 'uz' | 'ru';
export const SUPPORTED_LOCALES: readonly Locale[] = ['uz', 'ru'] as const;
export const DEFAULT_LOCALE: Locale = 'uz';
const STORAGE_KEY = 'mgo.miniapp.lang';

type Dict = Record<string, unknown>;

// Токен сборки из имени main-бандла (Angular фингерпринтит его на каждом
// билде). Привязываем URL словарей к нему: новый деплой → новый URL →
// браузер не отдаёт устаревший словарь из старого долгого кеша.
function buildToken(): string {
  try {
    for (const el of Array.from(document.querySelectorAll('script[src]'))) {
      const m = (el as HTMLScriptElement).src.match(/main-([A-Za-z0-9]+)\.js/);
      if (m) return m[1];
    }
  } catch { /* noop */ }
  return 'v1';
}
const BUILD = buildToken();

// LocaleService
//
// Грузит uz.json + ru.json как статические ассеты (Angular копирует их из
// packages/shared/src/i18n/locales/ - см. angular.json assets).
//
// Использование:
//   this.locale.t('miniapp.buyer.home.title')
//   this.locale.t('miniapp.buyer.errors.BELOW_MIN_ORDER', { min: '30 000 сум' })
//   this.locale.setLanguage('ru')
//
// Также есть TPipe для шаблонов: `{{ 'miniapp.common.loading' | t }}`

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private dicts: Partial<Record<Locale, Dict>> = {};
  readonly current = signal<Locale>(this.readInitial());
  readonly ready = signal<boolean>(false);
  readonly version = computed(() => `${this.current()}:${this.ready() ? 'ready' : 'loading'}`);

  constructor(private http: HttpClient) {}

  private readInitial(): Locale {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'uz' || stored === 'ru') return stored;
    } catch { /* localStorage may be blocked */ }
    return DEFAULT_LOCALE;
  }

  async load(): Promise<void> {
    await Promise.all(SUPPORTED_LOCALES.map(async (loc) => {
      if (this.dicts[loc]) return;
      const dict = await firstValueFrom(this.http.get<Dict>(`assets/i18n/${loc}.json?v=${BUILD}`));
      this.dicts[loc] = dict;
    }));
    this.ready.set(true);
  }

  setLanguage(loc: Locale) {
    if (!SUPPORTED_LOCALES.includes(loc)) return;
    this.current.set(loc);
    try { localStorage.setItem(STORAGE_KEY, loc); } catch { /* noop */ }
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const cur = this.current();
    const found = this.lookup(cur, key) ?? this.lookup(this.fallback(cur), key);
    if (typeof found !== 'string') return key;
    return interpolate(found, vars);
  }

  hasKey(key: string): boolean {
    return typeof this.lookup(this.current(), key) === 'string';
  }

  private lookup(loc: Locale, key: string): unknown {
    const dict = this.dicts[loc];
    if (!dict) return undefined;
    const parts = key.split('.');
    let cur: unknown = dict;
    for (const p of parts) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }

  private fallback(loc: Locale): Locale {
    return loc === 'uz' ? 'ru' : 'uz';
  }
}

function interpolate(tpl: string, vars?: Record<string, string | number>): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, name) => {
    const v = vars[name];
    return v === undefined || v === null ? m : String(v);
  });
}
