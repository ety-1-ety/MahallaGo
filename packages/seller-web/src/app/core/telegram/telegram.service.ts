import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../../environments/environment';

// ─────────────────────────────────────────────────────────────────────
// Telegram WebApp адаптер
//
// Источник: window.Telegram.WebApp (загружен через telegram-web-app.js в index.html)
// На локалке (environment.useTelegramSdkMock = true) — синтезируем mock-объект,
// чтобы SPA можно было открыть в обычном Chrome.
//
// Что отдаёт сервис:
//   • initData (строка для отправки на backend /auth/init)
//   • themeParams (для CSS-переменных)
//   • MainButton / BackButton / HapticFeedback — обёртки с null-safe
//   • signal<colorScheme> для реактивного переключения light/dark
//   • signal<viewportStableHeight> для CSS var --tg-viewport-stable-height
// ─────────────────────────────────────────────────────────────────────

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  themeParams: TelegramThemeParams;
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  expand(): void;
  ready(): void;
  close(): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  MainButton: {
    text: string;
    isVisible: boolean;
    isProgressVisible: boolean;
    isActive: boolean;
    setText(text: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  requestLocation?(cb: (granted: boolean) => void): void;
  sendData?(data: string): void;
  openLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function buildMock(): TelegramWebApp {
  // Для локалки: mock-юзер берётся из environment.mockTelegramUser, если задан.
  // Это позволяет seller-web подставлять telegram_id владельца магазина из БД
  // без ручного редактирования сервиса.
  // initData собираем валидной формы, но HMAC будет провален на проде — OK для local dev.
  const fromEnv = environment.mockTelegramUser;
  const mockUser: TelegramUser = fromEnv ?? {
    id: 35767754,
    first_name: 'Тимур',
    username: 'ety_1_ety',
    language_code: 'ru',
  };
  const initDataParams = new URLSearchParams({
    user: JSON.stringify(mockUser),
    auth_date: String(Math.floor(Date.now() / 1000)),
    hash: 'mock-hash-not-verified-on-server',
  });

  const callbacks = new Map<string, Set<() => void>>();
  function on(ev: string, cb: () => void) {
    if (!callbacks.has(ev)) callbacks.set(ev, new Set());
    callbacks.get(ev)!.add(cb);
  }
  function off(ev: string, cb: () => void) {
    callbacks.get(ev)?.delete(cb);
  }

  const noop = () => undefined;
  return {
    initData: initDataParams.toString(),
    initDataUnsafe: { user: mockUser, start_param: undefined },
    themeParams: {
      bg_color: '#07090f',
      text_color: '#e6f2ee',
      hint_color: '#93a4b3',
      button_color: '#1eb53a',
      button_text_color: '#ffffff',
      secondary_bg_color: '#0d1220',
    },
    colorScheme: 'dark',
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    isExpanded: true,
    expand: noop,
    ready: noop,
    close: () => console.log('[tg-mock] close()'),
    onEvent: on,
    offEvent: off,
    MainButton: {
      text: '',
      isVisible: false,
      isProgressVisible: false,
      isActive: true,
      setText(t: string) { this.text = t; },
      show() { this.isVisible = true; logMain('show', this.text); },
      hide() { this.isVisible = false; logMain('hide'); },
      enable() { this.isActive = true; },
      disable() { this.isActive = false; },
      showProgress() { this.isProgressVisible = true; },
      hideProgress() { this.isProgressVisible = false; },
      onClick(cb: () => void) {
        const btn = ensureMockMainButton(this as TelegramWebApp['MainButton'] & { _onClick?: () => void });
        btn._onClick = cb;
      },
      offClick() {
        const btn = this as TelegramWebApp['MainButton'] & { _onClick?: () => void };
        btn._onClick = undefined;
      },
      setParams(p) {
        if (p.text !== undefined) this.text = p.text;
        if (p.is_visible !== undefined) p.is_visible ? this.show() : this.hide();
        if (p.is_active !== undefined) p.is_active ? this.enable() : this.disable();
        logMain('setParams', this.text, p);
      },
    },
    BackButton: {
      isVisible: false,
      show() { this.isVisible = true; },
      hide() { this.isVisible = false; },
      onClick(cb: () => void) {
        const btn = this as TelegramWebApp['BackButton'] & { _onClick?: () => void };
        btn._onClick = cb;
      },
      offClick() {
        const btn = this as TelegramWebApp['BackButton'] & { _onClick?: () => void };
        btn._onClick = undefined;
      },
    },
    HapticFeedback: {
      impactOccurred: (style) => console.log('[tg-mock] haptic.impact', style),
      notificationOccurred: (type) => console.log('[tg-mock] haptic.notification', type),
      selectionChanged: () => console.log('[tg-mock] haptic.selection'),
    },
  };
}

function logMain(action: string, ...rest: unknown[]) {
  console.log(`[tg-mock] MainButton.${action}`, ...rest);
}
function ensureMockMainButton<T>(btn: T): T { return btn; }

@Injectable({ providedIn: 'root' })
export class TelegramService {
  private webApp: TelegramWebApp;
  readonly isMock: boolean;

  readonly colorScheme = signal<'light' | 'dark'>('light');
  readonly themeParams = signal<TelegramThemeParams>({});
  readonly viewportHeight = signal<number>(window.innerHeight);
  readonly user = signal<TelegramUser | null>(null);
  readonly startParam = signal<string | undefined>(undefined);

  readonly isDark = computed(() => this.colorScheme() === 'dark');

  constructor() {
    const native = window.Telegram?.WebApp;
    if (native && native.initData && native.initData.length > 0) {
      this.webApp = native;
      this.isMock = false;
    } else if (environment.useTelegramSdkMock) {
      this.webApp = buildMock();
      this.isMock = true;
      console.warn('[telegram] Using mock Telegram WebApp for local dev');
    } else {
      // Production без initData — деградируем на пустой stub, ошибку покажет authService.
      this.webApp = native ?? (buildMock());
      this.isMock = !native;
    }

    this.applyState();
    this.webApp.ready?.();
    this.webApp.expand?.();

    this.webApp.onEvent?.('themeChanged', () => this.applyState());
    this.webApp.onEvent?.('viewportChanged', () => {
      this.viewportHeight.set(this.webApp.viewportStableHeight || window.innerHeight);
      this.updateCssVars();
    });
  }

  get initData(): string {
    return this.webApp.initData || '';
  }

  // ─── MainButton ────────────────────────────────────────────────
  showMainButton(text: string, onClick: () => void, opts: { progress?: boolean; active?: boolean } = {}) {
    this.webApp.MainButton.setText(text);
    if (opts.active === false) this.webApp.MainButton.disable();
    else this.webApp.MainButton.enable();
    if (opts.progress) this.webApp.MainButton.showProgress(false);
    else this.webApp.MainButton.hideProgress();
    // offClick + onClick — Telegram не даёт читать привязанные коллбэки, поэтому держим один последний.
    if (this.currentMainClick) this.webApp.MainButton.offClick(this.currentMainClick);
    this.currentMainClick = onClick;
    this.webApp.MainButton.onClick(onClick);
    this.webApp.MainButton.show();
  }
  hideMainButton() {
    if (this.currentMainClick) this.webApp.MainButton.offClick(this.currentMainClick);
    this.currentMainClick = undefined;
    this.webApp.MainButton.hide();
  }
  setMainButtonProgress(active: boolean) {
    if (active) this.webApp.MainButton.showProgress(false);
    else this.webApp.MainButton.hideProgress();
  }
  private currentMainClick?: () => void;

  // ─── BackButton ────────────────────────────────────────────────
  showBackButton(onClick: () => void) {
    if (this.currentBackClick) this.webApp.BackButton.offClick(this.currentBackClick);
    this.currentBackClick = onClick;
    this.webApp.BackButton.onClick(onClick);
    this.webApp.BackButton.show();
  }
  hideBackButton() {
    if (this.currentBackClick) this.webApp.BackButton.offClick(this.currentBackClick);
    this.currentBackClick = undefined;
    this.webApp.BackButton.hide();
  }
  private currentBackClick?: () => void;

  // ─── Haptics ───────────────────────────────────────────────────
  haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection' = 'light') {
    try {
      if (kind === 'success' || kind === 'error' || kind === 'warning') {
        this.webApp.HapticFeedback.notificationOccurred(kind);
      } else if (kind === 'selection') {
        this.webApp.HapticFeedback.selectionChanged();
      } else {
        this.webApp.HapticFeedback.impactOccurred(kind);
      }
    } catch { /* noop */ }
  }

  close() {
    try { this.webApp.close(); } catch { /* noop */ }
  }

  // ─── Применение темы ────────────────────────────────────────────
  private applyState() {
    this.colorScheme.set(this.webApp.colorScheme || 'light');
    this.themeParams.set(this.webApp.themeParams || {});
    this.viewportHeight.set(this.webApp.viewportStableHeight || window.innerHeight);
    this.user.set(this.webApp.initDataUnsafe?.user ?? null);
    this.startParam.set(this.webApp.initDataUnsafe?.start_param);

    const root = document.documentElement;
    if (this.webApp.colorScheme === 'dark') {
      root.classList.add('dark-theme');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark-theme');
      root.setAttribute('data-theme', 'light');
    }

    // Подмешиваем Telegram theme params в наши --mgo-* переменные.
    const tp = this.webApp.themeParams || {};
    if (tp.bg_color)        root.style.setProperty('--mgo-bg-1', tp.bg_color);
    if (tp.secondary_bg_color) root.style.setProperty('--mgo-bg-2', tp.secondary_bg_color);
    if (tp.text_color)      root.style.setProperty('--mgo-text', tp.text_color);
    if (tp.hint_color)      root.style.setProperty('--mgo-text-muted', tp.hint_color);
    this.updateCssVars();
  }

  private updateCssVars() {
    const h = this.webApp.viewportStableHeight || window.innerHeight;
    document.documentElement.style.setProperty('--tg-viewport-stable-height', `${h}px`);
  }
}
