import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ActivityService } from '../../../core/services/activity.service';
import { ActivityItemComponent } from '../activity-item/activity-item.component';

@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [CommonModule, ScrollingModule, ActivityItemComponent],
  templateUrl: './activity-list.component.html',
  styleUrl: './activity-list.component.scss'
})
export class ActivityListComponent {
  activityService = inject(ActivityService);
  
  activities = this.activityService.filteredActivities;
  selectedActivity = this.activityService.selectedActivity;

  select(item: any) {
    this.activityService.selectActivity(item);
  }
}
