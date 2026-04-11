import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationRecipient, NotificationType } from '../../../core/models/notification.models';

@Component({
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="activity-item" [class.unread]="!recipient.isRead" (click)="clickItem.emit(recipient)">
      <div class="avatar-container">
        <img *ngIf="recipient.notification?.actorAvatar"
             [src]="recipient.notification?.actorAvatar" class="avatar" alt="avatar" />
        <div *ngIf="!recipient.notification?.actorAvatar" class="avatar-placeholder"
             [style.background-color]="getAvatarColor()">
          {{ (recipient.notification?.actorName || 'S') | slice:0:1 | uppercase }}
        </div>
        <div class="type-badge" [ngClass]="getTypeClass()">
          <i [class]="getIcon()"></i>
        </div>
      </div>

      <div class="content">
        <div class="row-top">
          <span class="actor-name">{{ recipient.notification?.actorName || 'Someone' }}</span>
          <span class="timestamp">{{ formatTime(recipient.notification?.createdAt) }}</span>
        </div>
        <div class="action-line">
          <span class="action-label">{{ getActionLabel() }}</span>
        </div>
        <div class="preview-line" *ngIf="getPreview()">
          {{ getPreview() }}
        </div>
      </div>

      <div class="unread-dot" *ngIf="!recipient.isRead"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .activity-item {
      display: flex;
      align-items: flex-start;
      padding: 10px 14px;
      gap: 10px;
      cursor: pointer;
      position: relative;
      transition: background 0.15s ease;
      border-bottom: 1px solid var(--fluent-border, #EDEBE9);
    }
    .activity-item:hover { background: var(--fluent-bg-hover, #EDEBE9); }
    .activity-item.unread { background: var(--fluent-primary-soft, rgba(37,99,235,0.06)); }
    .activity-item.unread:hover { background: var(--fluent-bg-hover, #EDEBE9); }

    /* Avatar */
    .avatar-container { position: relative; flex-shrink: 0; }
    .avatar, .avatar-placeholder {
      width: 40px; height: 40px; border-radius: 50%;
    }
    .avatar { object-fit: cover; }
    .avatar-placeholder {
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: #fff;
    }

    /* Type badge */
    .type-badge {
      position: absolute; bottom: -2px; right: -2px;
      width: 18px; height: 18px; border-radius: 50%;
      border: 1.5px solid var(--fluent-bg-surface, #fff);
      display: flex; align-items: center; justify-content: center;
      font-size: 9px;
    }
    .type-badge.mention  { background: #FEE2E2; color: #DC2626; }
    .type-badge.reaction { background: #FEF9C3; color: #CA8A04; }
    .type-badge.meeting  { background: #DBEAFE; color: var(--fluent-primary, #2563EB); }
    .type-badge.reply    { background: #F0FDF4; color: #16A34A; }
    .type-badge.call     { background: #FEF2F2; color: #DC2626; }
    .type-badge.default  { background: var(--fluent-bg-subtle, #FAF9F8); color: var(--fluent-text-subtle, #A19F9D); }

    /* Content */
    .content { flex: 1; min-width: 0; }
    .row-top {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 1px;
    }
    .actor-name {
      font-size: 13px; font-weight: 600;
      color: var(--fluent-text-primary, #323130);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 160px;
    }
    .timestamp {
      font-size: 11px; color: var(--fluent-text-subtle, #A19F9D);
      flex-shrink: 0; margin-left: 6px;
    }
    .action-line { margin-bottom: 1px; }
    .action-label {
      font-size: 12px; color: var(--fluent-text-secondary, #605E5C);
    }
    .preview-line {
      font-size: 12px; color: var(--fluent-text-subtle, #A19F9D);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .unread .actor-name { color: var(--fluent-text-primary, #111); font-weight: 700; }
    .unread .action-label { color: var(--fluent-text-secondary, #323130); }

    /* Unread dot */
    .unread-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--fluent-primary, #2563EB);
      align-self: center; flex-shrink: 0;
    }
  `]
})
export class ActivityItemComponent {
  @Input({ required: true }) recipient!: NotificationRecipient;
  @Output() clickItem = new EventEmitter<NotificationRecipient>();

  getIcon(): string {
    switch (this.recipient.notification?.type) {
      case NotificationType.DirectMention:
      case NotificationType.GroupMention:  return 'bi bi-at';
      case NotificationType.Reaction:      return 'bi bi-emoji-smile';
      case NotificationType.MeetingCreated:
      case NotificationType.MeetingUpdated: return 'bi bi-calendar-check';
      case NotificationType.MeetingCanceled: return 'bi bi-calendar-x';
      case NotificationType.ThreadReply:   return 'bi bi-reply-fill';
      case NotificationType.MissedCall:    return 'bi bi-telephone-x';
      default:                             return 'bi bi-bell';
    }
  }

  getTypeClass(): string {
    const type = this.recipient.notification?.type as string | undefined;
    if (!type) return 'default';
    if (type === NotificationType.DirectMention || type === NotificationType.GroupMention) return 'mention';
    if (type === NotificationType.Reaction) return 'reaction';
    if (type === NotificationType.ThreadReply) return 'reply';
    if (type === NotificationType.MissedCall) return 'call';
    if (type.toLowerCase().includes('meeting')) return 'meeting';
    return 'default';
  }

  getActionLabel(): string {
    switch (this.recipient.notification?.type) {
      case NotificationType.DirectMention:  return 'Mentioned you in a message';
      case NotificationType.GroupMention:   return 'Mentioned your group';
      case NotificationType.Reaction:       return 'Reacted to your message';
      case NotificationType.MeetingCreated: return 'Invited you to a meeting';
      case NotificationType.MeetingUpdated: return 'Updated a meeting';
      case NotificationType.MeetingCanceled: return 'Canceled a meeting';
      case NotificationType.ThreadReply:    return 'Replied to your message';
      case NotificationType.MissedCall:     return 'Missed call';
      default:                              return 'Sent a notification';
    }
  }

  getPreview(): string {
    return this.recipient.notification?.body || '';
  }

  getAvatarColor(): string {
    const name = this.recipient.notification?.actorName || '';
    const colors = [
      '#2563EB', '#7C3AED', '#059669', '#D97706',
      '#DC2626', '#0891B2', '#BE185D', '#065F46'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  formatTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
