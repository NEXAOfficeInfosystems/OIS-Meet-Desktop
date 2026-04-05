import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';
import { FilterTabsComponent } from './filter-tabs/filter-tabs.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { NotificationBadgeComponent } from './notification-badge/notification-badge.component';
import { NotificationRecipient } from '../../core/models/notification.models';
import { Router } from '@angular/router';

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
    <div class="activity-feed-container">
      <div class="header">
        <h1>Activity</h1>
        <div class="header-actions">
           <button class="icon-btn" (click)="notificationService.markAllAsRead()" title="Mark all as read">
             <i class="bi bi-check-all"></i>
           </button>
           <app-notification-badge [count]="notificationService.unreadCount()"></app-notification-badge>
        </div>
      </div>
      
      <app-filter-tabs></app-filter-tabs>

      <div class="activity-list" (scroll)="onScroll($event)">
        <div *ngIf="notifications().length === 0 && !isLoading()" class="empty-state">
           <i class="bi bi-bell-slash"></i>
           <p>No activity yet.</p>
        </div>
        
        <app-activity-item 
          *ngFor="let item of notifications()" 
          [recipient]="item" 
          (clickItem)="onNotificationClick($event)">
        </app-activity-item>

        <div *ngIf="isLoading()" class="loading-state">
           <div class="spinner"></div>
           <span>Loading activity...</span>
        </div>
        
        <div *ngIf="!hasMore() && notifications().length > 0" class="end-of-list">
           <span>You're all caught up.</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .activity-feed-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f8fafc; /* Matches sidebar background */
      width: 100%;
    }
    .header {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #323130;
      margin: 0;
    }
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: #616161;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover {
      background: #f3f2f1;
      color: #5b5fc7;
    }
    .activity-list {
      flex: 1;
      overflow-y: auto;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 40px;
      color: #616161;
      text-align: center;
    }
    .empty-state i {
      font-size: 48px;
      margin-bottom: 12px;
      color: #edebe9;
    }
    .loading-state, .end-of-list {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #616161;
      gap: 8px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #5b5fc7;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `]
})
export class ActivityFeedComponent implements OnInit {
  notificationService = inject(NotificationService);
  router = inject(Router);

  notifications = this.notificationService.notifications;
  isLoading = this.notificationService.isLoading;
  hasMore = this.notificationService.hasMore;

  ngOnInit() {
    this.notificationService.loadInitial();
  }

  onNotificationClick(recipient: NotificationRecipient) {
    if (!recipient.isRead) {
      this.notificationService.markAsRead([recipient.id]);
    }

    const n = recipient.notification;
    if (!n) return;

    // Navigate to context
    if (n.entityType === 'Message') {
      // Assuming entityId is messageId, but we might need conversationId
      // In a real app we'd load the conversation context
      this.router.navigate(['/chat', n.entityId]);
    } else if (n.entityType === 'Meeting') {
      this.router.navigate(['/meeting', n.entityId]);
    }
  }

  onScroll(event: any) {
    const element = event.target;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 100) {
      this.notificationService.loadMore();
    }
  }
}
