import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UnifiedActivityItem } from '../activity-feed.component';
import { InitialsPipe } from '../../../shared/pipes/initials.pipe';

@Component({
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="activity-item" [class.unread]="!item.read" (click)="clickItem.emit(item)">
      <div class="avatar-container">
        <img *ngIf="item.user.avatar"
             [src]="item.user.avatar" class="avatar" alt="avatar" />
        <div *ngIf="!item.user.avatar" class="avatar-placeholder"
             [style.background-color]="getAvatarColor()">
          {{ (item.user.name || 'S') | initials }}
        </div>
        <div class="type-badge" [ngClass]="item.type">
          <i [class]="getIcon()"></i>
        </div>
      </div>

      <div class="content">
        <div class="row-top">
          <span class="actor-name">{{ item.user.name || 'Someone' }}</span>
          <span class="timestamp">{{ formatTime(item.timestamp) }}</span>
        </div>
        <div class="action-line">
          <span class="action-label">{{ getActionLabel() }}</span>
        </div>
        <div class="preview-line" *ngIf="item.description">
          {{ item.description }}
        </div>
      </div>

      <div class="unread-dot" *ngIf="!item.read"></div>
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
      border-radius: 8px; /* Added slight rounding for teams-like modern feel */
      background: transparent;
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
    .type-badge.missed_call { background: #FEF2F2; color: #DC2626; }
    .type-badge.file     { background: #E0E7FF; color: #4338CA; }
    .type-badge.system   { background: var(--fluent-bg-subtle, #FAF9F8); color: var(--fluent-text-subtle, #A19F9D); }

    /* Content */
    .content { flex: 1; min-width: 0; }
    .row-top {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 2px;
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
    .action-line { margin-bottom: 2px; }
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
  @Input({ required: true }) item!: UnifiedActivityItem;
  @Output() clickItem = new EventEmitter<UnifiedActivityItem>();

  getIcon(): string {
    switch (this.item.type) {
      case 'mention': return 'bi bi-at';
      case 'reaction': return 'bi bi-emoji-smile';
      case 'reply': return 'bi bi-reply-fill';
      case 'missed_call': return 'bi bi-telephone-x';
      case 'file': return 'bi bi-file-earmark-text';
      case 'meeting': return 'bi bi-camera-video';
      default: return 'bi bi-bell';
    }
  }

  getActionLabel(): string {
    switch (this.item.type) {
      case 'mention': return 'Mentioned you in a message';
      case 'reaction': return 'Reacted to your message';
      case 'reply': return 'Replied to your message';
      case 'missed_call': return 'Missed call';
      case 'file': return 'Shared a file';
      case 'meeting': return 'Started a meeting';
      default: return 'Sent a notification';
    }
  }

  getAvatarColor(): string {
    const name = this.item.user.name || '';
    const colors = [
      '#2563EB', '#7C3AED', '#059669', '#D97706',
      '#DC2626', '#0891B2', '#BE185D', '#065F46'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  formatTime(ts: number): string {
    if (!ts || isNaN(ts)) return 'Recent';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    
    // Protection against future dates or clock drift
    if (diffMs < 0) return 'just now';

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
