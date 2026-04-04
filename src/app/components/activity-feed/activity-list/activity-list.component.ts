import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityItemComponent } from '../activity-item/activity-item.component';

@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [CommonModule, ActivityItemComponent],
  template: `
    <aside class="activity-sidebar">
      <header class="sidebar-header">
        <div class="sidebar-title-row">
          <div class="d-flex align-items-center gap-2">
            <h2 class="sidebar-title">Activity</h2>
            <span class="unread-badge" *ngIf="unreadCount > 0">{{ unreadCount }}</span>
          </div>
          <button class="btn-refresh" (click)="refresh.emit()" title="Refresh">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        <div class="filter-tabs">
          <button class="filter-tab" 
                  *ngFor="let f of filters"
                  [class.active]="activeFilter === f" 
                  (click)="filterChange.emit(f)">
            {{ f === 'Mentions' ? '@Mentions' : f }}
          </button>
        </div>
      </header>

      <div class="activity-scroll-container">
        <!-- Skeleton Loaders -->
        <div *ngIf="loading" class="placeholder-loader">
          <div class="skeleton-item" *ngFor="let i of [1,2,3,4,5,6]"></div>
        </div>

        <!-- Activity Items -->
        <div *ngIf="!loading" class="list-wrapper">
          <app-activity-item
            *ngFor="let item of items"
            [item]="item"
            [isActive]="selectedId === item.id"
            (select)="select.emit($event)">
          </app-activity-item>

          <!-- Empty State -->
          <div class="empty-state" *ngIf="items.length === 0">
            <div class="empty-icon text-muted opacity-25">
               <i class="bi bi-bell-slash" style="font-size: 3rem;"></i>
            </div>
            <p class="fw-semibold mt-3">All caught up!</p>
            <p class="text-muted fs-xs">No activity to show in {{ activeFilter }}</p>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .activity-sidebar {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border-right: 1px solid #f0f1f4;
    }

    .sidebar-header {
      padding: 16px;
      flex-shrink: 0;
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .sidebar-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .sidebar-title {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      color: #1a1d21;
    }

    .unread-badge {
      background: #E53E3E;
      color: white;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .btn-refresh {
      background: transparent;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover { background: #f1f5f9; color: #1e293b; }
    }

    .filter-tabs {
      display: flex;
      gap: 4px;
      background: #f1f5f9;
      padding: 3px;
      border-radius: 8px;
    }

    .filter-tab {
      flex: 1;
      padding: 6px 12px;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;

      &:hover { color: #1e293b; }
      &.active {
        background: #ffffff;
        color: #0066FF;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
    }

    .activity-scroll-container {
      flex: 1;
      overflow-y: auto;
      padding-top: 4px;
      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .skeleton-item {
      height: 80px;
      margin: 8px 16px;
      background: #f1f5f9;
      border-radius: 8px;
      animation: pulse 1.5s infinite ease-in-out;
    }

    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
  `]
})
export class ActivityListComponent {
  @Input() items: any[] = [];
  @Input() loading = false;
  @Input() unreadCount = 0;
  @Input() activeFilter = 'All';
  @Input() selectedId: string | null = null;
  @Output() filterChange = new EventEmitter<string>();
  @Output() select = new EventEmitter<any>();
  @Output() refresh = new EventEmitter<void>();

  filters = ['All', 'Unread', 'Mentions'];
}
