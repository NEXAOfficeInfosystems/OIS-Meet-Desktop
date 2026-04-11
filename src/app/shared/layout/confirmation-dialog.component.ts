import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

export type ConfirmType = 'warning' | 'info' | 'error' | 'success' | 'question';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="custom-dialog-box" [class.destructive]="isDestructive">
      <div class="custom-dialog-header">
        <div style="display: flex; align-items: center">
          <div class="icon-wrapper" [class.destructive]="isDestructive">
            <i class="fas" [ngClass]="fasIcon"></i>
          </div>
          <span class="fw-bold">{{ data.title || (data.isAlert ? 'Notice' : 'Confirm') }}</span>
        </div>
        <button class="close-btn" (click)="close(false)"><i class="fas fa-times"></i></button>
      </div>
      <div class="custom-dialog-body">
        <p>{{ data.message }}</p>
      </div>
      <div class="custom-dialog-footer">
        <button *ngIf="!data.isAlert" class="dialog-btn-cancel" (click)="close(false)">{{ data.cancelText || 'Cancel' }}</button>
        <button class="dialog-btn-confirm" [class.destructive]="isDestructive" (click)="close(true)">{{ data.confirmText || (data.isAlert ? 'OK' : 'Confirm') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .custom-dialog-box {
      width: 400px;
      max-width: 90vw;
      background: #ffffff;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .custom-dialog-box.destructive { border-color: rgba(239, 68, 68, 0.3); }
    .custom-dialog-header {
      padding: 10px 20px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
    }
    .icon-wrapper {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6366f1;
      font-size: 1.1rem;
    }
    .icon-wrapper.destructive { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .fw-bold { font-size: 1.05rem; font-weight: 700; color: #1e293b; margin-left: 8px;}
    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .close-btn:hover { background: #e2e8f0; color: #1e293b; }
    .custom-dialog-body {
      padding: 24px 20px;
      color: #475569;
      font-size: 0.95rem;
      line-height: 1.5;
      text-align: center;
    }
    .custom-dialog-body p { margin: 0; }
    .custom-dialog-footer {
      padding: 7px 20px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: #f8fafc;
    }
    .custom-dialog-footer button {
      padding: 5px 20px;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .dialog-btn-cancel {
      background: #ffffff;
      color: #64748b;
      border: 1px solid #e2e8f0;
    }
    .dialog-btn-cancel:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e0; }
    .dialog-btn-confirm {
      background: #6366f1;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
    }
    .dialog-btn-confirm:hover { background: #4f46e5; transform: translateY(-1px); }
    .dialog-btn-confirm.destructive { background: #ef4444; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25); }
    .dialog-btn-confirm.destructive:hover { background: #dc2626; }
    :host ::ng-deep .mdc-dialog__surface { 
      border-radius: 20px !important;
      padding: 0 !important;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2) !important;
      background: transparent !important;
    }
  `]
})
export class ConfirmationDialogComponent {

  fasIcon = 'fa-info-circle';
  isDestructive = false;

  constructor(
    private dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.setType(data.type || 'info');
  }

  setType(type: ConfirmType) {
    switch (type) {
      case 'info':
        this.fasIcon = 'fa-info-circle';
        this.isDestructive = false;
        break;
      case 'error':
        this.fasIcon = 'fa-exclamation-circle';
        this.isDestructive = true;
        break;
      case 'success':
        this.fasIcon = 'fa-check-circle';
        this.isDestructive = false;
        break;
      case 'question':
        this.fasIcon = 'fa-question-circle';
        this.isDestructive = false;
        break;
      case 'warning':
      default:
        this.fasIcon = 'fa-exclamation-triangle';
        this.isDestructive = true;
    }
  }

  close(result: boolean) {
    this.dialogRef.close(result);
  }
}
