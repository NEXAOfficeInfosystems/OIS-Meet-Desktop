import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { NativeNotificationService } from '../../core/services/native-notification.service';
import { NotificationDto } from '../../core/models/collaboration.models';
import { SettingsService, UserSettings } from '../../core/services/settings.service';
import { Subject, takeUntil } from 'rxjs';


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
  settings: UserSettings = { showMessagePreview: true, showMediaPreviews: true, notificationsMentionsOnly: false };
  private destroy$ = new Subject<void>();


  constructor(
    private readonly collaboration: CollaborationService,
    private readonly nativeNotifications: NativeNotificationService,
    private readonly settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.settingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(s => this.settings = s);
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
