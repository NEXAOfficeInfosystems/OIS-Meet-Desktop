import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-notification-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span *ngIf="count > 0" class="badge" [class.badge-large]="count > 9">
      {{ count > 99 ? '99+' : count }}
    </span>
  `,
  styles: [`
    .badge {
      --badge-size: 20px;
      background: #c4314b; /* Teams-like red */
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 10px;
      min-width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid #ffffff;
    }
    .badge-large {
      padding: 2px 4px;
    }
  `]
})
export class NotificationBadgeComponent {
  @Input() count: number = 0;
}
