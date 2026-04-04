import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../../../core/services/activity.service';

@Component({
  selector: 'app-activity-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-header.component.html',
  styleUrl: './activity-header.component.scss'
})
export class ActivityHeaderComponent {
  activityService = inject(ActivityService);
  
  unreadCount = this.activityService.unreadCount;

  refresh() {
    this.activityService.loadActivities(this.activityService.activeFilter());
  }
}
