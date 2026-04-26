import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { ApiService, type PendingShop } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { RejectDialog } from './reject-dialog';

@Component({
  selector: 'app-moderation',
  standalone: true,
  imports: [
    MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatDialogModule, MatFormFieldModule, MatInputModule, FormsModule,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'moderation.title' | t }}</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (items().length === 0) {
        <mat-card class="empty" appearance="outlined">
          <mat-card-content>{{ 'moderation.empty' | t }}</mat-card-content>
        </mat-card>
      } @else {
        <div class="grid">
          @for (s of items(); track s.id) {
            <mat-card class="shop-card" appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ s.name }}</mat-card-title>
                <mat-card-subtitle>
                  📂 {{ s.category || '—' }}  ·  📞 {{ s.phone }}
                </mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="info-row"><mat-icon>place</mat-icon> {{ s.address }}</div>
                @if (s.description) {
                  <div class="info-row"><mat-icon>info</mat-icon> {{ s.description }}</div>
                }
                <div class="info-row">
                  <mat-icon>person</mat-icon>
                  {{ s.owner_first_name || '—' }}
                  @if (s.owner_username) { <span class="muted">&#64;{{ s.owner_username }}</span> }
                </div>
              </mat-card-content>
              <mat-card-actions>
                <button mat-flat-button color="primary" (click)="approve(s)">
                  <mat-icon>check</mat-icon> {{ 'moderation.approve' | t }}
                </button>
                <button mat-stroked-button color="warn" (click)="reject(s)">
                  <mat-icon>close</mat-icon> {{ 'moderation.reject' | t }}
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .loading { display: flex; justify-content: center; padding: 80px; }
    .empty   { padding: 32px; text-align: center; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .shop-card { padding: 16px; }
    .info-row { display: flex; align-items: center; gap: 8px; margin: 8px 0;
                color: var(--mat-sys-on-surface-variant); }
    .info-row mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .muted { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class Moderation implements OnInit {
  private readonly api    = inject(ApiService);
  private readonly i18n   = inject(I18nService);
  private readonly dialog = inject(MatDialog);

  protected readonly items   = signal<PendingShop[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit() {
    await this.refresh();
  }

  private async refresh() {
    this.loading.set(true);
    try {
      const items = await this.api.pendingShops().toPromise();
      this.items.set(items ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async approve(s: PendingShop) {
    try {
      await this.api.approveShop(s.id).toPromise();
      this.items.update((arr) => arr.filter((x) => x.id !== s.id));
    } catch (err) {
      alert(this.i18n.t('common.error'));
    }
  }

  async reject(s: PendingShop) {
    const ref = this.dialog.open(RejectDialog, { width: '400px' });
    const reason = await ref.afterClosed().toPromise();
    if (!reason) return;
    try {
      await this.api.rejectShop(s.id, reason).toPromise();
      this.items.update((arr) => arr.filter((x) => x.id !== s.id));
    } catch (err) {
      alert(this.i18n.t('common.error'));
    }
  }
}
