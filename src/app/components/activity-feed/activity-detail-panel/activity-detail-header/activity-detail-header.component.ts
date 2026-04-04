import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityItem } from '../../../../core/models/activity.models';

@Component({
  selector: 'app-activity-detail-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-detail-header.component.html',
  styleUrl: './activity-detail-header.component.scss'
})
export class ActivityDetailHeaderComponent {
  activity = input.required<ActivityItem | null>();

  getDisplayName(): string {
    return this.activity()?.sender?.fullName || this.activity()?.senderName || 'System';
  }

  getAvatarLetter(): string {
    return this.getDisplayName().charAt(0).toUpperCase() || 'S';
  }

  getAvatarColor(): string {
    const source = this.activity()?.sender?.fullName || this.activity()?.senderName || 'System';
    const colors = ['#4f7cff', '#10b981', '#f97316', '#a855f7', '#0ea5e9', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      hash = source.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getAvatarImage(): string | null {
    return this.activity()?.sender?.avatarUrl || this.activity()?.senderAvatar || null;
  }
}
