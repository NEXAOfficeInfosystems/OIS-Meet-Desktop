import { Injectable, signal, NgZone, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationRecipient } from '../models/notification.models';

@Injectable({
  providedIn: 'root'
})
export class NotificationSignalrService {
  private ngZone = inject(NgZone);
  private hubConnection!: signalR.HubConnection;
  
  // Events
  private newNotificationSubject = new Subject<NotificationRecipient>();
  private unreadCountSubject = new Subject<number>();
  
  newNotification$ = this.newNotificationSubject.asObservable();
  unreadCount$ = this.unreadCountSubject.asObservable();

  startConnection(userId: string | null): void {
    if (!userId) return;

    if (this.hubConnection && (
      this.hubConnection.state === signalR.HubConnectionState.Connected ||
      this.hubConnection.state === signalR.HubConnectionState.Connecting
    )) return;

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    const url = `${baseUrl}/hubs/notifications?userId=${userId}`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('NewNotification', (notification: NotificationRecipient) => {
      this.ngZone.run(() => this.newNotificationSubject.next(notification));
    });

    this.hubConnection.on('UnreadCountUpdated', (count: number) => {
      this.ngZone.run(() => this.unreadCountSubject.next(count));
    });

    this.hubConnection.start()
      .then(() => console.log('✅ Notification SignalR Connected'))
      .catch(err => console.error('❌ Notification SignalR Error:', err));
  }

  stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}
