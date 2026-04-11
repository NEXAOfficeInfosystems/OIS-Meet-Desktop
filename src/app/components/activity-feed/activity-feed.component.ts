import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';
import { FilterTabsComponent } from './filter-tabs/filter-tabs.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { NotificationBadgeComponent } from './notification-badge/notification-badge.component';
import { NotificationRecipient } from '../../core/models/notification.models';

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [
    CommonModule,
    FilterTabsComponent,
    ActivityItemComponent,
    NotificationBadgeComponent
  ],
  template: `
    <div class="activity-feed">

      <!-- Header -->
      <div class="feed-header">
        <h2 class="feed-title">Activity</h2>
        <div class="feed-header-actions">
          <button class="icon-btn" (click)="notificationService.markAllAsRead()"
                  title="Mark all as read"
                  [disabled]="notificationService.unreadCount() === 0">
            <i class="bi bi-check2-all"></i>
          </button>
          <app-notification-badge [count]="notificationService.unreadCount()"></app-notification-badge>
        </div>
      </div>

      <!-- Filter Tabs -->
      <app-filter-tabs></app-filter-tabs>

      <!-- List -->
      <div class="feed-list" (scroll)="onScroll($event)">

        <!-- Empty state -->
        <div *ngIf="notificationService.notifications().length === 0 && !notificationService.isLoading()"
             class="empty-state">
          <div class="empty-icon"><i class="bi bi-bell-slash"></i></div>
          <p class="empty-title">No activity yet</p>
          <p class="empty-sub">Mentions, reactions, and missed calls will appear here.</p>
        </div>

        <!-- Activity items -->
        <app-activity-item
          *ngFor="let item of notificationService.notifications(); trackBy: trackById"
          [recipient]="item"
          (clickItem)="onNotificationClick($event)">
        </app-activity-item>

        <!-- Load more spinner -->
        <div *ngIf="notificationService.isLoading()" class="loading-row">
          <div class="spinner-border spinner-border-sm text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <!-- End of list -->
        <div *ngIf="!notificationService.hasMore() && notificationService.notifications().length > 0"
             class="end-row">
          You're all caught up
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--fluent-bg-surface, #fff);
    }

    .activity-feed {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    /* Header */
    .feed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 10px;
      flex-shrink: 0;
    }
    .feed-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--fluent-text-primary, #323130);
      margin: 0;
    }
    .feed-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: var(--fluent-text-secondary, #605E5C);
      padding: 5px 6px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .icon-btn:hover { background: var(--fluent-bg-hover, #EDEBE9); color: var(--fluent-primary, #2563EB); }
    .icon-btn:disabled { opacity: 0.4; cursor: default; }

    /* List */
    .feed-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 56px 32px;
      text-align: center;
    }
    .empty-icon {
      width: 64px; height: 64px; border-radius: 50%;
      background: var(--fluent-bg-subtle, #FAF9F8);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px;
      font-size: 28px;
      color: var(--fluent-text-subtle, #A19F9D);
    }
    .empty-title {
      font-size: 15px; font-weight: 600;
      color: var(--fluent-text-primary, #323130); margin: 0 0 6px;
    }
    .empty-sub {
      font-size: 12px; color: var(--fluent-text-subtle, #A19F9D);
      margin: 0; max-width: 220px; line-height: 1.5;
    }

    /* Footer rows */
    .loading-row, .end-row {
      display: flex; justify-content: center; align-items: center;
      padding: 16px; font-size: 12px;
      color: var(--fluent-text-subtle, #A19F9D);
    }
  `]
})
export class ActivityFeedComponent implements OnInit {
  notificationService = inject(NotificationService);

  ngOnInit() {
    this.notificationService.loadInitial();
  }

  onNotificationClick(recipient: NotificationRecipient) {
    if (!recipient.isRead) {
      this.notificationService.markAsRead([recipient.id]);
    }
    this.notificationService.selectedNotification.set(recipient);
  }

  onScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 120) {
      this.notificationService.loadMore();
    }
  }

  trackById(_: number, item: NotificationRecipient): string {
    return item.id;
  }
}
