import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-filter-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="filter-tabs">
      <button 
        *ngFor="let filter of filters" 
        [class.active]="activeFilter() === filter.value"
        (click)="notificationService.setFilter(filter.value)">
        {{ filter.label }}
      </button>
    </div>
  `,
  styles: [`
    .filter-tabs {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #e1dfdd;
    }
    button {
      background: none;
      border: none;
      padding: 4px 8px;
      font-size: 13px;
      font-weight: 400;
      color: #616161;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    button:hover {
      background: #f3f2f1;
      color: #323130;
    }
    button.active {
      color: #5b5fc7; /* Teams primary color */
      font-weight: 600;
      position: relative;
    }
    button.active::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 8px;
      right: 8px;
      height: 3px;
      background: #5b5fc7;
      border-radius: 2px;
    }
  `]
})
export class FilterTabsComponent {
  notificationService = inject(NotificationService);
  activeFilter = this.notificationService.activeFilter;

  filters: { label: string, value: 'all' | 'unread' | 'mentions' | 'missed' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Mentions', value: 'mentions' },
    { label: 'Missed', value: 'missed' }
  ];
}
