import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { ApiService, type ShopRow } from '../../core/api/api.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-shops-list',
  standalone: true,
  imports: [
    MatTableModule, MatCardModule, MatChipsModule, MatProgressSpinnerModule,
    MatButtonToggleModule, MatFormFieldModule, MatInputModule,
    FormsModule, RouterLink, DatePipe, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1 class="page-title">{{ 'shops.title' | t }}</h1>

      <div class="filters">
        <mat-button-toggle-group [value]="statusFilter()" (change)="setStatus($event.value)">
          <mat-button-toggle value="">{{ 'shops.filter.all'       | t }}</mat-button-toggle>
          <mat-button-toggle value="active">{{ 'shops.filter.active'    | t }}</mat-button-toggle>
          <mat-button-toggle value="pending_approval">{{ 'shops.filter.pending' | t }}</mat-button-toggle>
          <mat-button-toggle value="suspended">{{ 'shops.filter.suspended'   | t }}</mat-button-toggle>
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" class="search">
          <mat-label>{{ 'common.search' | t }}</mat-label>
          <input matInput [(ngModel)]="q" (keyup.enter)="reload()">
        </mat-form-field>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <mat-card appearance="outlined">
          <table mat-table [dataSource]="rows()" class="full">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'shops.col.name' | t }}</th>
              <td mat-cell *matCellDef="let r">
                <a [routerLink]="['/shops', r.id]">{{ r.name }}</a>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'shops.col.status' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ ('shops.status.' + r.status) | t }}</td>
            </ng-container>
            <ng-container matColumnDef="owner">
              <th mat-header-cell *matHeaderCellDef>{{ 'shops.col.owner' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.owner_first_name || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="created">
              <th mat-header-cell *matHeaderCellDef>{{ 'shops.col.created' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.created_at | date:'dd.MM.yyyy HH:mm' }}</td>
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
    .search { width: 300px; }
    .loading { display: flex; justify-content: center; padding: 80px; }
    .full { width: 100%; }
    .empty { padding: 32px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `],
})
export class ShopsList implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly columns = ['name', 'status', 'owner', 'created'];
  protected readonly rows = signal<ShopRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal('');
  protected q = '';

  async ngOnInit() {
    await this.reload();
  }

  setStatus(v: string) {
    this.statusFilter.set(v);
    this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      const res = await this.api.shops({
        status: this.statusFilter() || undefined,
        q: this.q || undefined,
        page: 1,
        per_page: 100,
      }).toPromise();
      this.rows.set(res?.items ?? []);
    } finally {
      this.loading.set(false);
    }
  }
}
