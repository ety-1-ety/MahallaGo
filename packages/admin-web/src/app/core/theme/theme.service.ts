import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'mgo_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<'light' | 'dark'>(this.readInitial());

  constructor() {
    this.apply(this.mode());
  }

  toggle() {
    const next = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    localStorage.setItem(STORAGE_KEY, next);
    this.apply(next);
  }

  private readInitial(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private apply(mode: 'light' | 'dark') {
    const root = document.documentElement;
    if (mode === 'dark') root.classList.add('dark-theme');
    else root.classList.remove('dark-theme');
  }
}
