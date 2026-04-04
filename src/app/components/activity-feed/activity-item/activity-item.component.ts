import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="activity-item"
             [class.active]="isActive"
             [class.unread]="!item.isRead"
             (click)="select.emit(item)">

      <div class="item-visual">
        <div class="avatar-wrapper">
          <div class="avatar" [style.background-color]="item.avatarColor">
            {{ item.avatarLetter }}
          </div>
          <div class="badge-overlay">
            <i class="bi" [ngClass]="getCategoryIcon(item.category)"></i>
          </div>
        </div>
      </div>

      <div class="item-content">
        <div class="item-header">
          <span class="item-title">
            <strong>{{ item.senderName }}</strong>
            <span class="action-label"> {{ getActivityTypeText(item) }}</span>
          </span>
          <span class="item-time">{{ item.timeLabel }}</span>
        </div>

        <p class="item-preview" *ngIf="item.body">
          {{ item.body }}
        </p>

        <div class="item-context">
          <i class="bi" [ngClass]="getDisplayIcon(item)"></i>
          <span>{{ item.entityName || 'In chat with you' }}</span>
        </div>
      </div>

      <div class="unread-indicator" *ngIf="!item.isRead"></div>
    </article>
  `,
  styles: [`
    .activity-item {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      cursor: pointer;
      position: relative;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin: 4px 8px;
      background: transparent;

      &:hover {
        background: rgba(0, 102, 255, 0.04);
      }

      &.active {
        background: #f0f7ff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        &::before {
          content: '';
          position: absolute;
          left: 0;
          top: 12px;
          bottom: 12px;
          width: 4px;
          background: #0066FF;
          border-radius: 0 4px 4px 0;
        }
      }
    }

    .avatar-wrapper {
      position: relative;
      flex-shrink: 0;
    }

    .avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .badge-overlay {
      position: absolute;
      bottom: -2px;
      right: -2px;
      background: white;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      border: 1.5px solid white;
    }

    .item-content {
      flex: 1;
      min-width: 0;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }

    .item-title {
      font-size: 13px;
      color: #1a1d21;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      strong { font-weight: 600; }
      .action-label { color: #61666d; margin-left: 4px; }
    }

    .item-time {
      font-size: 11px;
      color: #8b949e;
      white-space: nowrap;
      margin-left: 8px;
    }

    .item-preview {
      font-size: 12px;
      color: #61666d;
      margin: 2px 0 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }

    .item-context {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #8b949e;
      i { font-size: 12px; }
    }

    .unread-indicator {
      width: 8px;
      height: 8px;
      background: #0066FF;
      border-radius: 50%;
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
    }

    .unread {
      .item-title strong { color: #000; }
      .item-preview { color: #1a1d21; font-weight: 500; }
    }
  `]
})
export class ActivityItemComponent {
  @Input() item!: any;
  @Input() isActive = false;
  @Output() select = new EventEmitter<any>();

  getCategoryIcon(category: string): string {
    switch (category) {
      case 'mention': return 'bi-at text-primary';
      case 'reply': return 'bi-reply-fill text-info';
      case 'reaction': return 'bi-hand-thumbs-up-fill text-warning';
      case 'missed-call': return 'bi-telephone-x-fill text-danger';
      case 'file': return 'bi-file-earmark-fill text-success';
      case 'meeting': return 'bi-calendar-event text-primary';
      default: return 'bi-chat-left-text';
    }
  }

  getActivityTypeText(item: any): string {
    switch (item.category) {
      case 'mention': return 'mentioned you';
      case 'reply': return 'replied to your message';
      case 'reaction': return 'reacted to your message';
      case 'missed-call': return 'missed a call with you';
      case 'file': return 'shared a file';
      case 'meeting': return 'invited you to a meeting';
      default: return 'sent a message';
    }
  }

  getDisplayIcon(item: any): string {
    if (item.entityType === 'Channel') return 'bi-hash';
    if (item.entityType === 'Conversation') return 'bi-chat-dots-fill';
    return 'bi-chat-dots';
  }
}
