import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService, type AdminRow } from '../../core/api/api.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    MatCardModule, MatTableModule, MatChipsModule, MatProgressSpinnerModule,
    DatePipe, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'settings.title' | t }}</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <mat-card class="block" appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'settings.admins' | t }}</mat-card-title>
            <mat-card-subtitle>{{ 'settings.admins_desc' | t }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (admins().length === 0) {
              <div class="empty">{{ 'settings.no_admins' | t }}</div>
            } @else {
              <table mat-table [dataSource]="admins()" class="full">
                <ng-container matColumnDef="tg">
                  <th mat-header-cell *matHeaderCellDef>{{ 'users.col.tg' | t }}</th>
                  <td mat-cell *matCellDef="let a">
                    @if (a.username) { @{{ a.username }} } @else { #{{ a.telegram_id }} }
                  </td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>{{ 'users.col.name' | t }}</th>
                  <td mat-cell *matCellDef="let a">{{ a.first_name || '—' }} {{ a.last_name || '' }}</td>
                </ng-container>
                <ng-container matColumnDef="lang">
                  <th mat-header-cell *matHeaderCellDef>{{ 'users.col.lang' | t }}</th>
                  <td mat-cell *matCellDef="let a">{{ a.language_code }}</td>
                </ng-container>
                <ng-container matColumnDef="last_seen">
                  <th mat-header-cell *matHeaderCellDef>{{ 'users.col.last_seen' | t }}</th>
                  <td mat-cell *matCellDef="let a">
                    {{ a.last_seen_at ? (a.last_seen_at | date:'dd.MM.yyyy HH:mm') : '—' }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="adminColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: adminColumns"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>

        <mat-card class="block" appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'settings.whitelist' | t }}</mat-card-title>
            <mat-card-subtitle>{{ 'settings.whitelist_desc' | t }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (whitelist().length === 0) {
              <div class="empty">{{ 'settings.no_whitelist' | t }}</div>
            } @else {
              <div class="chips">
                @for (id of whitelist(); track id) {
                  <mat-chip>#{{ id }}</mat-chip>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .loading { display: flex; justify-content: center; padding: 80px; }
    .block { margin-bottom: 16px; }
    .full { width: 100%; }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  `],
})
export class Settings implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly adminColumns = ['tg', 'name', 'lang', 'last_seen'];
  protected readonly admins = signal<AdminRow[]>([]);
  protected readonly whitelist = signal<number[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [admins, wl] = await Promise.all([
        this.api.admins().toPromise(),
        this.api.whitelist().toPromise(),
      ]);
      this.admins.set(admins ?? []);
      this.whitelist.set(wl?.admin_tg_ids ?? []);
    } finally {
      this.loading.set(false);
    }
  }
}
