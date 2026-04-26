import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Если уже знаем пользователя — пропускаем
  if (auth.user()) return true;

  // Проверяем cookie через /api/auth/me
  const me = await auth.fetchMe();
  if (me) return true;

  router.navigate(['/login']);
  return false;
};
