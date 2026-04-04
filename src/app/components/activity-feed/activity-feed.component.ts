import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../core/services/activity.service';
import { ActivityHeaderComponent } from './activity-list-panel/activity-header/activity-header.component';
import { ActivityFilterTabsComponent } from './activity-list-panel/activity-filter-tabs/activity-filter-tabs.component';
import { ActivityListComponent } from './activity-list/activity-list.component';
import { ActivityDetailHeaderComponent } from './activity-detail-panel/activity-detail-header/activity-detail-header.component';
import { ActivityDetailTabsComponent } from './activity-detail-panel/activity-detail-tabs/activity-detail-tabs.component';
import { ChatThreadComponent } from './activity-detail-panel/chat-thread/chat-thread.component';
import { ReplyBarComponent } from './reply-bar/reply-bar.component';
import { MessageService } from '../../core/services/message.service';

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [
    CommonModule, 
    ActivityHeaderComponent, 
    ActivityFilterTabsComponent, 
    ActivityListComponent,
    ActivityDetailHeaderComponent,
    ActivityDetailTabsComponent,
    ChatThreadComponent,
    ReplyBarComponent
  ],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss'
})
export class ActivityFeedComponent implements OnInit {
  activityService = inject(ActivityService);
  messageService = inject(MessageService);

  selectedActivity = this.activityService.selectedActivity;
  activeDetailTab = 'chat' as 'chat' | 'shared';

  ngOnInit() {
    this.activityService.loadActivities();
  }

  onSendReply(event: { text: string, html: string }) {
    const activity = this.selectedActivity();
    if (activity) {
      this.messageService.sendMessage(activity.contextId, event.text);
    }
  }
}
