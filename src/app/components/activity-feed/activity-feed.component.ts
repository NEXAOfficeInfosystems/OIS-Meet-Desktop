import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityDto } from '../../core/models/collaboration.models';

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss'
})
export class ActivityFeedComponent implements OnInit {
  items: ActivityDto[] = [];
  loading = true;

  constructor(
    private readonly collaboration: CollaborationService,
    private readonly session: SessionService
  ) {}

  ngOnInit(): void {
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (!userId) {
      this.loading = false;
      return;
    }

    this.collaboration.getActivity(50).subscribe({
      next: (res) => {
        this.items = res.data ?? [];
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }
}
