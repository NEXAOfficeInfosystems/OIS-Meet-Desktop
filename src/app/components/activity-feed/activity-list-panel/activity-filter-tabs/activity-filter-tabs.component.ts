import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../../../core/services/activity.service';

@Component({
  selector: 'app-activity-filter-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-filter-tabs.component.html',
  styleUrl: './activity-filter-tabs.component.scss'
})
export class ActivityFilterTabsComponent {
  activityService = inject(ActivityService);
  
  activeFilter = this.activityService.activeFilter;

  setFilter(filter: 'all' | 'unread' | 'mentions') {
    this.activityService.activeFilter.set(filter);
    this.activityService.loadActivities(filter);
  }
}
