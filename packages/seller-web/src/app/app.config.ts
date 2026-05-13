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
      inject(TelegramService);
      const locale = inject(LocaleService);
      await locale.load();
      const auth = inject(AuthService);
      await auth.init();
    }),
  ],
};
