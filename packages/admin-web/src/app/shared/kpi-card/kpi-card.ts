import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="kpi" appearance="outlined">
      <mat-card-content>
        <div class="header">
          <mat-icon class="icon" [style.background]="iconBg()">{{ icon() }}</mat-icon>
          <span class="label">{{ label() }}</span>
        </div>
        <div class="value">{{ value() }}</div>
        @if (sub()) { <div class="sub">{{ sub() }}</div> }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .kpi { padding: 16px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .icon { color: white; padding: 8px; border-radius: 8px; font-size: 20px;
            width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; }
    .label { font-size: 13px; color: var(--mat-sys-on-surface-variant); text-transform: uppercase;
             letter-spacing: 0.5px; font-weight: 500; }
    .value { font-size: 32px; font-weight: 700; line-height: 1; }
    .sub { font-size: 12px; color: var(--mat-sys-on-surface-variant); margin-top: 6px; }
  `],
})
export class KpiCard {
  readonly label  = input<string>('');
  readonly value  = input<string | number>('—');
  readonly icon   = input<string>('insights');
  readonly sub    = input<string>('');
  readonly iconBg = input<string>('#1eb53a');
}
