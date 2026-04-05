import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { NotificationRecipient, NotificationType } from '../../../core/models/notification.models';

@Component({
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="activity-item" [class.unread]="!recipient.isRead" (click)="clickItem.emit(recipient)">
      <div class="avatar-container">
        <img *ngIf="recipient.notification?.actorAvatar" [src]="recipient.notification?.actorAvatar" class="avatar" />
        <div *ngIf="!recipient.notification?.actorAvatar" class="avatar-placeholder">
          {{ (recipient.notification?.actorName || 'S') | slice:0:1 }}
        </div>
        <div class="type-icon" [ngClass]="getTypeClass()">
           <i [class]="getIcon()"></i>
        </div>
      </div>
      <div class="content">
        <div class="header">
          <span class="actor-name">{{ recipient.notification?.actorName || 'Someone' }}</span>
          <span class="timestamp">{{ recipient.notification?.createdAt | date:'HH:mm' }}</span>
        </div>
        <div class="message-preview">
           <strong>{{ getActionLabel() }}</strong>
           <span class="entity-type" *ngIf="recipient.notification?.entityType">{{ recipient.notification?.entityType }}: </span>
           <span>{{ getPreview() }}</span>
        </div>
      </div>
      <div class="unread-dot" *ngIf="!recipient.isRead"></div>
    </div>
  `,
  styles: [`
    .activity-item {
      display: flex;
      padding: 12px 16px;
      gap: 12px;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      background: white;
    }
    .activity-item:hover {
      background: #f5f5f5;
    }
    .activity-item.unread {
      background: #fafafa;
    }
    .avatar-container {
      position: relative;
      flex-shrink: 0;
    }
    .avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      object-fit: cover;
    }
    .avatar-placeholder {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #edebe9;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      color: #323130;
    }
    .type-icon {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      border: 1px solid #e1dfdd;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .type-icon.mention { background: #feebe8; color: #c4314b; }
    .type-icon.meeting { background: #e7eef8; color: #5b5fc7; }
    .type-icon.reaction { background: #fffae6; color: #8a6d3b; }
    
    .content {
      flex: 1;
      min-width: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .actor-name {
      font-size: 14px;
      font-weight: 600;
      color: #323130;
    }
    .timestamp {
      font-size: 11px;
      color: #616161;
    }
    .message-preview {
      font-size: 13px;
      color: #616161;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .unread-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #c4314b;
      align-self: center;
      margin-left: 8px;
    }
    .unread .actor-name { color: #000; font-weight: 700; }
  `]
})
export class ActivityItemComponent {
  @Input({ required: true }) recipient!: NotificationRecipient;
  @Output() clickItem = new EventEmitter<NotificationRecipient>();

  getIcon() {
    switch (this.recipient.notification?.type) {
      case NotificationType.DirectMention: return 'bi bi-at';
      case NotificationType.GroupMention: return 'bi bi-at';
      case NotificationType.Reaction: return 'bi bi-hand-thumbs-up';
      case NotificationType.MeetingCreated: return 'bi bi-calendar-plus';
      case NotificationType.MeetingCanceled: return 'bi bi-calendar-x';
      case NotificationType.ThreadReply: return 'bi bi-reply';
      case NotificationType.MissedCall: return 'bi bi-telephone-x';
      default: return 'bi bi-bell';
    }
  }

  getTypeClass() {
    const type = this.recipient.notification?.type;
    if (type?.includes('Mention')) return 'mention';
    if (type?.includes('Meeting') || type === NotificationType.MissedCall) return 'meeting';
    if (type === NotificationType.Reaction) return 'reaction';
    return '';
  }

  getActionLabel() {
    switch (this.recipient.notification?.type) {
      case NotificationType.DirectMention: return 'Mentioned you';
      case NotificationType.GroupMention: return 'Mentioned your group';
      case NotificationType.Reaction: return 'Reacted to your';
      case NotificationType.MeetingCreated: return 'Invited you to';
      case NotificationType.MeetingCanceled: return 'Canceled meeting';
      case NotificationType.ThreadReply: return 'Replied to your';
      case NotificationType.MissedCall: return 'Missed call from';
      default: return 'sent a notification';
    }
  }

  getPreview() {
    // This could be message snippet, meeting title etc.
    return ''; // Should be loaded via notification service or pre-populated in notification object
  }
}
