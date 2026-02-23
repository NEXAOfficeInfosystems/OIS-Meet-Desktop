import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

export type ConfirmType = 'warning' | 'info' | 'error' | 'success' | 'question';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="confirm-container">

      <div class="confirm-icon" [ngClass]="iconClass">
        <i class="bi" [ngClass]="iconName"></i>
      </div>

      <div class="confirm-title">
        {{ data.title }}
      </div>

      <div class="confirm-message">
        {{ data.message }}
      </div>

      <div class="confirm-actions">
        <button class="btn btn-outline-secondary btn-sm px-3"
                (click)="close(false)">
          {{ data.cancelText || 'Cancel' }}
        </button>

        <button class="btn btn-sm px-3"
                [ngClass]="confirmButtonClass"
                (click)="close(true)">
          {{ data.confirmText || 'Confirm' }}
        </button>
      </div>

    </div>
  `,
  styles: [`
    .confirm-container {
      text-align: center;
      padding: 18px 20px;
      min-width: 260px;
      max-width: 320px;
    }

    .confirm-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .confirm-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .confirm-message {
      font-size: 13.5px;
      color: #6c757d;
      margin-bottom: 16px;
      line-height: 1.4;
    }

    .confirm-actions {
      display: flex;
      justify-content: center;
      gap: 8px;
    }

    ::ng-deep .mat-mdc-dialog-container {
      padding: 0 !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
  `]
})
export class ConfirmationDialogComponent {

  iconName = 'bi-exclamation-triangle-fill';
  iconClass = 'text-warning';
  confirmButtonClass = 'btn-primary';

  constructor(
    private dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.setType(data.type || 'warning');
  }

  setType(type: ConfirmType) {
    switch (type) {

      case 'info':
        this.iconName = 'bi-info-circle-fill';
        this.iconClass = 'text-primary';
        this.confirmButtonClass = 'btn-primary';
        break;

      case 'error':
        this.iconName = 'bi-x-circle-fill';
        this.iconClass = 'text-danger';
        this.confirmButtonClass = 'btn-danger';
        break;

      case 'success':
        this.iconName = 'bi-check-circle-fill';
        this.iconClass = 'text-success';
        this.confirmButtonClass = 'btn-success';
        break;

      case 'question':
        this.iconName = 'bi-question-circle-fill';
        this.iconClass = 'text-secondary';
        this.confirmButtonClass = 'btn-primary';
        break;

      default:
        this.iconName = 'bi-exclamation-triangle-fill';
        this.iconClass = 'text-warning';
        this.confirmButtonClass = 'btn-warning';
    }
  }

  close(result: boolean) {
    this.dialogRef.close(result);
  }
}
