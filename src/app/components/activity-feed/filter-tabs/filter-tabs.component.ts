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
        *ngFor="let f of filters"
        [class.active]="notificationService.activeFilter() === f.value"
        (click)="notificationService.setFilter(f.value)">
        {{ f.label }}
      </button>
    </div>
  `,
  styles: [`
    .filter-tabs {
      display: flex;
      gap: 2px;
      padding: 4px 10px 0;
      border-bottom: 1px solid var(--fluent-border, #EDEBE9);
      flex-shrink: 0;
    }
    button {
      background: none;
      border: none;
      padding: 6px 10px;
      font-size: 13px;
      font-weight: 400;
      color: var(--fluent-text-secondary, #605E5C);
      cursor: pointer;
      border-radius: 4px 4px 0 0;
      position: relative;
      transition: color 0.15s ease, background 0.15s ease;
      white-space: nowrap;
    }
    button:hover {
      background: var(--fluent-bg-hover, #EDEBE9);
      color: var(--fluent-text-primary, #323130);
    }
    button.active {
      color: var(--fluent-primary, #2563EB);
      font-weight: 600;
    }
    button.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 6px;
      right: 6px;
      height: 2px;
      background: var(--fluent-primary, #2563EB);
      border-radius: 2px 2px 0 0;
    }
  `]
})
export class FilterTabsComponent {
  notificationService = inject(NotificationService);

  filters: { label: string; value: 'all' | 'unread' | 'mentions' | 'missed' }[] = [
    { label: 'All',      value: 'all' },
    { label: 'Unread',   value: 'unread' },
    { label: 'Mentions', value: 'mentions' },
    { label: 'Missed',   value: 'missed' }
  ];
}
