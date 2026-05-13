import { ApplicationConfig, provideAppInitializer, inject } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { LocaleService } from './core/i18n/locale.service';
import { TelegramService } from './core/telegram/telegram.service';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptorsFromDi()),
    provideAppInitializer(async () => {
      // 1) Поднимаем Telegram WebApp адаптер (читает initData, тему, viewport)
      inject(TelegramService);
      // 2) Загружаем словари uz + ru до первого рендера
      const locale = inject(LocaleService);
      await locale.load();
      // 3) Авторизация — посылаем initData на /auth/init, ждём ответ.
      //    Если упадёт — AuthService.error будет выставлен, App покажет экран ошибки.
      const auth = inject(AuthService);
      await auth.init();
    }),
  ],
};
