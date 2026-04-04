import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityType } from '../../../core/models/activity.models';

@Component({
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-item.component.html',
  styleUrl: './activity-item.component.scss'
})
export class ActivityItemComponent {
  activity = input.required<any>(); // Grouped activity (with count)
  isSelected = input<boolean>(false);

  ActivityType = ActivityType;

  getDisplayText() {
    const act = this.activity();
    if (act.count > 1 && act.type === ActivityType.FileShared) {
      return `${act.senderName} shared ${act.count} files`;
    }
    return act.preview || act.title || 'New activity';
  }

  getIconClass() {
    switch (this.activity().type) {
      case ActivityType.Mention: return 'bi-at';
      case ActivityType.FileShared: return 'bi-file-earmark';
      case ActivityType.MeetingInvite: return 'bi-calendar-event';
      case ActivityType.MeetingStarted: return 'bi-camera-video';
      case ActivityType.Reply: return 'bi-reply';
      case ActivityType.Reaction: return 'bi-emoji-smile';
      case ActivityType.TeamCreated: return 'bi-people';
      case ActivityType.ChannelCreated: return 'bi-hash';
      default: return 'bi-chat-left-text';
    }
  }

  getAvatarLetter(): string {
    const name = (this.activity()?.senderName || '').trim();
    if (!name) return 'S';
    return name.charAt(0).toUpperCase();
  }

  getAvatarClass(): string {
    return this.activity()?.senderName ? 'avatar' : 'avatar is-system';
  }
}
