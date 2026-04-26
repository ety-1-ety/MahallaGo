import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ApiService, type UserRow } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    MatTableModule, MatCardModule, MatChipsModule, MatProgressSpinnerModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    FormsModule, DatePipe, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'users.title' | t }}</h1>

      <div class="filters">
        <mat-form-field appearance="outline" class="search">
          <mat-label>{{ 'common.search' | t }}</mat-label>
          <input matInput [(ngModel)]="q" (keyup.enter)="reload()" placeholder="@username / +998..." />
        </mat-form-field>
        <button mat-stroked-button (click)="reload()">
          <mat-icon>refresh</mat-icon> {{ 'common.refresh' | t }}
        </button>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <mat-card appearance="outlined">
          <table mat-table [dataSource]="rows()" class="full">
            <ng-container matColumnDef="tg">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.tg' | t }}</th>
              <td mat-cell *matCellDef="let r">
                @if (r.username) { @{{ r.username }} } @else { #{{ r.telegram_id }} }
              </td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.name' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.first_name || '—' }} {{ r.last_name || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="phone">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.phone' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.phone || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="lang">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.lang' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.language_code }}</td>
            </ng-container>
            <ng-container matColumnDef="last_seen">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.last_seen' | t }}</th>
              <td mat-cell *matCellDef="let r">
                {{ r.last_seen_at ? (r.last_seen_at | date:'dd.MM.yyyy HH:mm') : '—' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.role' | t }}</th>
              <td mat-cell *matCellDef="let r">
                @if (r.is_blocked) {
                  <mat-chip class="role-blocked">{{ 'users.role.blocked' | t }}</mat-chip>
                } @else if (r.is_admin) {
                  <mat-chip class="role-admin">{{ 'users.role.admin' | t }}</mat-chip>
                } @else {
                  <span class="role-user">{{ 'users.role.user' | t }}</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.col.actions' | t }}</th>
              <td mat-cell *matCellDef="let r">
                @if (!r.is_blocked) {
                  @if (r.is_admin) {
                    <button mat-button color="warn" (click)="toggleAdmin(r, false)">
                      {{ 'users.action.revoke_admin' | t }}
                    </button>
                  } @else {
                    <button mat-button color="primary" (click)="toggleAdmin(r, true)">
                      {{ 'users.action.make_admin' | t }}
                    </button>
                  }
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>

          @if (rows().length === 0) {
            <div class="empty">{{ 'common.empty' | t }}</div>
          }
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .filters { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    .search { width: 320px; }
    .loading { display: flex; justify-content: center; padding: 80px; }
    .full { width: 100%; }
    .empty { padding: 32px; text-align: center; color: var(--mat-sys-on-surface-variant); }
    .role-admin   { background: rgba(30,181,58,0.15); color: #1eb53a; font-weight: 500; }
    .role-blocked { background: rgba(220,38,38,0.15); color: #dc2626; font-weight: 500; }
    .role-user    { color: var(--mat-sys-on-surface-variant); }
  `],
})
export class UsersList implements OnInit {
  private readonly api  = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly columns = ['tg', 'name', 'phone', 'lang', 'last_seen', 'role', 'actions'];
  protected readonly rows = signal<UserRow[]>([]);
  protected readonly loading = signal(true);
  protected q = '';

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      const res = await this.api.users({ q: this.q || undefined, page: 1, per_page: 200 }).toPromise();
      this.rows.set(res?.items ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleAdmin(user: UserRow, makeAdmin: boolean) {
    const name = user.first_name || user.username || `#${user.telegram_id}`;
    const key = makeAdmin ? 'users.confirm.make_admin' : 'users.confirm.revoke_admin';
    if (!confirm(this.i18n.t(key, { name }))) return;
    try {
      await this.api.markAdmin(user.telegram_id, makeAdmin).toPromise();
      await this.reload();
    } catch {
      alert(this.i18n.t('common.error'));
    }
  }
}
