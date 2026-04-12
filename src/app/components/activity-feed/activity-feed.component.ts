import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../core/services/activity.service';
import { FilterTabsComponent } from './filter-tabs/filter-tabs.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { NotificationBadgeComponent } from './notification-badge/notification-badge.component';
import { ActivityItem as CoreActivityItem, ActivityType } from '../../core/models/activity.models';
import { toObservable } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ActivityChatBridgeService } from '../../core/services/activity-chat-bridge.service';
import { Output, EventEmitter } from '@angular/core';

export interface UnifiedActivityItem {
  id: string;
  type: 'mention' | 'missed_call' | 'reaction' | 'reply' | 'system' | 'meeting' | 'file';
  title: string;
  description: string;
  timestamp: number;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
  metadata?: any;
  read: boolean;
  original: CoreActivityItem;
}

export interface ActivityGroup {
  label: string;
  items: UnifiedActivityItem[];
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FilterTabsComponent,
    ActivityItemComponent,
    NotificationBadgeComponent,
    ScrollingModule
  ],
  template: `
    <div class="activity-feed">

      <!-- Header -->
      <div class="feed-header">
        <h2 class="feed-title">Activity</h2>
        <div class="feed-header-actions">
          <button class="icon-btn" (click)="markAllAsRead()"
                  title="Mark all as read"
                  [disabled]="activityService.unreadCount() === 0">
            <i class="bi bi-check2-all"></i>
          </button>
          <app-notification-badge [count]="activityService.unreadCount()"></app-notification-badge>
        </div>
      </div>

      <!-- Filter Tabs -->
      <app-filter-tabs></app-filter-tabs>

      <!-- List -->
      <div class="feed-list" (scroll)="onScroll($event)">

        <!-- Empty state -->
        <ng-container *ngIf="(isEmpty$ | async)">
          <div class="empty-state">
            <div class="empty-icon"><i class="bi bi-bell-slash"></i></div>
            <p class="empty-title">No activity yet</p>
            <p class="empty-sub">Mentions, reactions, shared files, and calls will appear here.</p>
          </div>
        </ng-container>

        <!-- Activity Groups -->
        <div class="activity-list" *ngIf="(activityGroups$ | async) as groups">
          <ng-container *ngFor="let group of groups">
             <div class="group-header" *ngIf="group.items.length > 0">{{ group.label }}</div>
             <app-activity-item
               *ngFor="let item of group.items; trackBy: trackById"
               [item]="item"
               (clickItem)="onActivityClick($event)">
             </app-activity-item>
          </ng-container>
        </div>

        <!-- End of list -->
        <div *ngIf="!(isEmpty$ | async)" class="end-row">
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
    
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 8px;
      height: calc(100vh - 200px);
      overflow-y: auto;
    }

    .group-header {
      font-size: 13px;
      font-weight: 600;
      color: var(--fluent-text-secondary, #605E5C);
      padding: 16px 16px 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
  activityService = inject(ActivityService);
  private bridgeService = inject(ActivityChatBridgeService);
  private page = 1;

  @Output() activityClicked = new EventEmitter<UnifiedActivityItem>();

  // Since activities are exposed as a computed signal filteredActivities:
  private rawActivities$ = toObservable(this.activityService.filteredActivities);

  isEmpty$ = this.rawActivities$.pipe(
    map(notifs => notifs.length === 0)
  );

  activityGroups$ = this.rawActivities$.pipe(
    map(notifs => {
      const limited = notifs.slice(0, 100);
      const items = limited.map(n => this.normalizeActivity(n));

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const grouped: { [key: string]: UnifiedActivityItem[] } = {
        'Today': [],
        'Yesterday': [],
        'Earlier': []
      };

      for (const item of items) {
        const d = new Date(item.timestamp);
        if (d >= today) {
          grouped['Today'].push(item);
        } else if (d >= yesterday) {
          grouped['Yesterday'].push(item);
        } else {
          grouped['Earlier'].push(item);
        }
      }

      const result: ActivityGroup[] = [];
      if (grouped['Today'].length > 0) result.push({ label: 'Today', items: grouped['Today'] });
      if (grouped['Yesterday'].length > 0) result.push({ label: 'Yesterday', items: grouped['Yesterday'] });
      if (grouped['Earlier'].length > 0) result.push({ label: 'Earlier', items: grouped['Earlier'] });

      return result;
    })
  );

  ngOnInit() {
    this.page = 1;
    this.activityService.loadActivities('all', this.page);
  }

  onActivityClick(item: UnifiedActivityItem) {
    this.activityService.selectActivity(item.original);
    
    // Emit for parent component if listening
    this.activityClicked.emit(item);

    // Also trigger via bridge for decoupled navigation
    this.bridgeService.openChat({
      conversationId: item.original.contextId || item.original.id,
      messageId: item.original.targetMessageId ?? undefined,
      senderId: item.original.senderId
    });
  }

  markAllAsRead() {
    const ids = this.activityService.activities().filter(a => !a.isRead).map(a => a.id);
    if (ids.length > 0) {
      this.activityService.markRead(ids);
    }
  }

  onScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 120) {
      this.page++;
      this.activityService.loadActivities('all', this.page);
    }
  }

  trackById(_: number, item: UnifiedActivityItem): string {
    return item.id;
  }

  private normalizeActivity(a: CoreActivityItem): UnifiedActivityItem {
    let t: UnifiedActivityItem['type'] = 'system';

    switch (a.type) {
      case ActivityType.FileShared: t = 'file'; break;
      case ActivityType.Mention: t = 'mention'; break;
      case ActivityType.MeetingInvite:
      case ActivityType.MeetingStarted: t = 'meeting'; break;
      case ActivityType.Reaction: t = 'reaction'; break;
      case ActivityType.Reply: t = 'reply'; break;
      case ActivityType.MissedCall: t = 'missed_call'; break;
      default: t = 'system';
    }

    // Sanitize high-precision date strings (e.g. 7 digits) to 3 digits for standard Date parsing
    const cleanedDate = a.createdAt?.replace(/(\.\d{3})\d+/, '$1');
    const timestamp = cleanedDate ? new Date(cleanedDate).getTime() : Date.now();

    return {
      id: a.id,
      type: t,
      title: a.senderName || (a.type === ActivityType.MissedCall ? 'Missed Call' : 'System'),
      description: a.type === ActivityType.MissedCall ? 'Missed a call' : (a.preview || a.context || ''),
      timestamp: timestamp,
      user: {
        id: a.senderId || '',
        name: a.senderName || '',
        avatar: a.senderAvatar || undefined,
      },
      read: a.isRead,
      original: a
    };
  }
}


