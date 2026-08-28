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
      // ВСЕ inject() - синхронно ДО первого await: после await Angular
      // теряет injection-контекст и inject() бросает NG0203.
      inject(TelegramService);
      const locale = inject(LocaleService);
      const auth = inject(AuthService);
      await locale.load();
      await auth.init();
    }),
  ],
};
