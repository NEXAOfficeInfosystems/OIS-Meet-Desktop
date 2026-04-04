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

  getAvatarLetter() {
    return this.activity()?.sender?.fullName?.charAt(0) || 'S';
  }
}
