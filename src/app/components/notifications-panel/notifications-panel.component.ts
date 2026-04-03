import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { NativeNotificationService } from '../../core/services/native-notification.service';
import { NotificationDto } from '../../core/models/collaboration.models';

@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss'
})
export class NotificationsPanelComponent implements OnInit {
  notifications: NotificationDto[] = [];
  unreadCount = 0;

  constructor(
    private readonly collaboration: CollaborationService,
    private readonly nativeNotifications: NativeNotificationService
  ) {}

  ngOnInit(): void {
    this.nativeNotifications.requestPermission();
    this.load();
  }

  load(): void {
    this.collaboration.getNotifications().subscribe({
      next: (res) => {
        this.notifications = res.data ?? [];
        this.unreadCount = res.unreadCount ?? 0;
      }
    });
  }

  markAllRead(): void {
    const ids = this.notifications.filter(n => !n.isRead).map(n => n.id);
    if (!ids.length) return;
    this.collaboration.markNotificationsRead(ids).subscribe(() => this.load());
  }
}
