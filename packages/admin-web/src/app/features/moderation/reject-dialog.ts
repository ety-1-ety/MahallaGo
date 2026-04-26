import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'app-reject-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FormsModule, TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'moderation.reject_reason' | t }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <textarea matInput [(ngModel)]="reason" rows="4"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">{{ 'common.cancel' | t }}</button>
      <button mat-flat-button color="warn"
              [disabled]="reason().trim().length < 2"
              (click)="ref.close(reason().trim())">
        {{ 'moderation.reject' | t }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full { width: 100%; }`],
})
export class RejectDialog {
  protected readonly ref = inject<MatDialogRef<RejectDialog, string | undefined>>(MatDialogRef);
  protected readonly reason = signal('');
}
