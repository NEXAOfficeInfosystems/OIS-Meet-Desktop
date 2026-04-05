import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { NotificationRecipient, PagedResult, NotificationType } from '../models/notification.models';
import { NotificationSignalrService } from './notification-signalr.service';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private signalr = inject(NotificationSignalrService);
  private session = inject(SessionService);
  private apiUrl = `${environment.apiBaseUrl}/notifications`;

  // State
  notifications = signal<NotificationRecipient[]>([]);
  selectedNotification = signal<NotificationRecipient | null>(null);
  unreadCount = signal<number>(0);
  activeFilter = signal<'all' | 'unread' | 'mentions' | 'missed'>('all');
  isLoading = signal<boolean>(false);
  page = signal<number>(1);
  hasMore = signal<boolean>(true);

  constructor() {
    this.signalr.newNotification$.subscribe(notification => {
      this.notifications.update(prev => [notification, ...prev]);
    });

    this.signalr.unreadCount$.subscribe(count => {
      this.unreadCount.set(count);
    });

    // Start SignalR connection if user is already logged in
    const userId = this.session.getOISMeetUserId();
    if (userId) {
      this.signalr.startConnection(userId);
    }
  }

  loadInitial() {
    this.page.set(1);
    this.hasMore.set(true);
    this.fetchNotifications(true);
    this.fetchUnreadCount();
  }

  loadMore() {
    if (this.isLoading() || !this.hasMore()) return;
    this.page.update(p => p + 1);
    this.fetchNotifications();
  }

  setFilter(filter: 'all' | 'unread' | 'mentions' | 'missed') {
    this.activeFilter.set(filter);
    this.loadInitial();
  }

  private fetchNotifications(reset = false) {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    this.isLoading.set(true);
    const filter = this.activeFilter();
    const page = this.page();
    
    this.http.get<PagedResult<NotificationRecipient>>(
      `${this.apiUrl}?userId=${userId}&filter=${filter}&page=${page}&pageSize=20`
    ).subscribe({
      next: (res) => {
        if (reset) {
          this.notifications.set(res.items);
        } else {
          this.notifications.update(prev => [...prev, ...res.items]);
        }
        this.hasMore.set(res.items.length === 20);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  private fetchUnreadCount() {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    this.http.get<number>(`${this.apiUrl}/unread-count?userId=${userId}`)
      .subscribe(count => this.unreadCount.set(count));
  }

  markAsRead(recipientIds: string[]) {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    // Optimistic update
    this.notifications.update(prev => prev.map(n => 
      recipientIds.includes(n.id) ? { ...n, isRead: true } : n
    ));

    this.http.post(`${this.apiUrl}/mark-as-read?userId=${userId}`, recipientIds).subscribe();
  }

  markAllAsRead() {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    // Optimistic update
    this.notifications.update(prev => prev.map(n => ({ ...n, isRead: true })));
    this.unreadCount.set(0);

    this.http.post(`${this.apiUrl}/mark-all-read?userId=${userId}`, {}).subscribe();
  }
}
