import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChatSignalrService } from './chat-signalr.service';
import { ChatService } from './chat.service';

@Injectable({
  providedIn: 'root'
})
export class PresenceService {
  private onlineUsersSubject = new BehaviorSubject<string[]>([]);
  public onlineUsers$ = this.onlineUsersSubject.asObservable();

  constructor(
    private chatSignalrService: ChatSignalrService,
    private chatService: ChatService
  ) {
    this.init();
  }

  private init(): void {
    // 1. Initial fetch via API
    this.fetchActiveUsers();

    // 2. Subscribe to SignalR events
    this.chatSignalrService.userOnline$.subscribe((userId: string) => {
      if (userId) this.addUser(userId);
    });

    this.chatSignalrService.userOffline$.subscribe((userId: string) => {
      if (userId) this.removeUser(userId);
    });

    this.chatSignalrService.activeUsersList$.subscribe((userIds: string[]) => {
      if (userIds) this.onlineUsersSubject.next(userIds);
    });

    // Custom ActiveUsersList event handling if provided by Hub
    // We can add it to ChatSignalrService or handle it via generic hub event
    (this.chatSignalrService as any).connectionState$.subscribe((state: any) => {
        // Re-fetch on reconnection
        if (state === 'Connected') {
            this.fetchActiveUsers();
        }
    });
  }

  fetchActiveUsers(): void {
    this.chatService.getActiveUsers().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.onlineUsersSubject.next(res.data);
        }
      },
      error: (err) => console.error('Failed to fetch active users', err)
    });
  }

  private addUser(userId: string): void {
    const current = this.onlineUsersSubject.value;
    if (!current.includes(userId)) {
      this.onlineUsersSubject.next([...current, userId]);
    }
  }

  private removeUser(userId: string): void {
    const current = this.onlineUsersSubject.value;
    this.onlineUsersSubject.next(current.filter(id => id !== userId));
  }

  isOnline(userId: string): boolean {
    return this.onlineUsersSubject.value.includes(userId);
  }
}
