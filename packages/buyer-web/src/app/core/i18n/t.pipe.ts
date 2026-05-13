import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';

// Pure pipe должен зависеть от signal версии локали, чтобы рендериться при смене.
// Решение: используем impure-pipe — Angular пересчитывает при каждом CD.
// Цена: t() пересчитывается часто, но операция дешёвая (lookup по словарю в памяти).
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  transform(key: string, vars?: Record<string, string | number>): string {
    // Trigger зависимости от signal'а — иначе impure pipe не среагирует на смену языка.
    void this.locale.version();
    return this.locale.t(key, vars);
  }
}
