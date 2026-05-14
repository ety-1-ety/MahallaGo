import { Injectable, signal } from '@angular/core';
import { ru } from './ru';
import { uz } from './uz';

const STORAGE_KEY = 'mgo_lang';
type Locale = 'uz' | 'ru';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>(this.readInitial());
  private readonly dicts: Record<Locale, Record<string, string>> = { uz, ru };

  set(locale: Locale) {
    this.locale.set(locale);
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }

  toggle() {
    this.set(this.locale() === 'ru' ? 'uz' : 'ru');
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const dict = this.dicts[this.locale()];
    let v = dict[key] ?? this.dicts[this.locale() === 'uz' ? 'ru' : 'uz'][key] ?? key;
    if (vars) {
      for (const [k, val] of Object.entries(vars)) {
        v = v.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
      }
    }
    return v;
  }

  private readInitial(): Locale {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'uz' || saved === 'ru') return saved;
    return 'ru';  // дефолт админки — русский
  }
}
