import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TPipe } from '../../core/i18n/t.pipe';
import { I18nService } from '../../core/i18n/i18n.service';

/**
 * Заглушка для незавершённых страниц MVP. Принимает titleKey из route.data.
 */
@Component({
  selector: 'app-stub',
  standalone: true,
  imports: [MatCardModule, MatIconModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ titleKey | t }}</h1>
      <mat-card appearance="outlined" class="stub">
        <mat-card-content>
          <mat-icon class="big">construction</mat-icon>
          <h2>{{ i18n.locale() === 'uz' ? 'Tez orada' : 'Скоро' }}</h2>
          <p>{{ i18n.locale() === 'uz'
              ? 'Bu sahifa keyingi versiyada qoʻshiladi.'
              : 'Эта страница появится в следующем релизе.' }}</p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .stub { padding: 48px; text-align: center; }
    .big { font-size: 64px; width: 64px; height: 64px; color: var(--mat-sys-tertiary); }
    h2 { margin: 16px 0 8px; }
    p { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class Stub {
  protected readonly i18n  = inject(I18nService);
  private readonly route = inject(ActivatedRoute);
  protected readonly titleKey = (this.route.snapshot.data as { titleKey?: string })['titleKey'] || 'common.empty';
}
