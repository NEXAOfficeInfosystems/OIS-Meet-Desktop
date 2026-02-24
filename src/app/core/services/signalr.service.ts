// core/services/signalr.service.ts
import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Observable, Subject } from 'rxjs';
import { Message } from './chat.service'; // Import the same Message interface

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection!: signalR.HubConnection;
  private messageReceivedSubject = new Subject<Message>(); // Use imported Message type
  private userTypingSubject = new Subject<{ userId: string; isTyping: boolean }>();
  private messageStatusSubject = new Subject<{ messageId: string; status: string; userId: string }>();
  private userOnlineSubject = new Subject<string>();
  private userOfflineSubject = new Subject<string>();
  private messageDeletedSubject = new Subject<string>();
  private newConversationSubject = new Subject<any>();

  public messageReceived$ = this.messageReceivedSubject.asObservable();
  public userTyping$ = this.userTypingSubject.asObservable();
  public messageStatus$ = this.messageStatusSubject.asObservable();
  public userOnline$ = this.userOnlineSubject.asObservable();
  public userOffline$ = this.userOfflineSubject.asObservable();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  public newConversation$ = this.newConversationSubject.asObservable();

  constructor() {}

  public startConnection(userId?: string): void {
    const baseUrl = environment.apiBaseUrl.replace('/api', '');

    // Build URL with optional userId for development
    let url = `${baseUrl}/chatHub`;
    if (userId) {
      url += `?userId=${userId}`;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection
      .start()
      .then(() => {
        console.log('✅ SignalR Connected (No Auth Mode)');
        this.registerOnServerEvents();
      })
      .catch(err => {
        console.error('❌ Error starting SignalR: ', err);
        // Retry after 5 seconds
        setTimeout(() => this.startConnection(userId), 5000);
      });

    this.hubConnection.onreconnected(() => {
      console.log('🔄 SignalR Reconnected');
    });

    this.hubConnection.onreconnecting(() => {
      console.log('⏳ SignalR Reconnecting...');
    });

    this.hubConnection.onclose(() => {
      console.log('🔌 SignalR Closed');
      setTimeout(() => this.startConnection(userId), 5000);
    });
  }

  private registerOnServerEvents(): void {
    this.hubConnection.on('ReceiveMessage', (message: Message) => {
      console.log('📨 Message received:', message);
      this.messageReceivedSubject.next(message);
    });

    this.hubConnection.on('UserTyping', (data: { userId: string; isTyping: boolean }) => {
      this.userTypingSubject.next(data);
    });

    this.hubConnection.on('MessageStatusUpdated', (data: { messageId: string; status: string; userId: string }) => {
      this.messageStatusSubject.next(data);
    });

    this.hubConnection.on('UserOnline', (userId: string) => {
      console.log('🟢 User online:', userId);
      this.userOnlineSubject.next(userId);
    });

    this.hubConnection.on('UserOffline', (userId: string) => {
      console.log('🔴 User offline:', userId);
      this.userOfflineSubject.next(userId);
    });

    this.hubConnection.on('MessageDeleted', (messageId: string) => {
      this.messageDeletedSubject.next(messageId);
    });

    this.hubConnection.on('NewConversation', (conversation: any) => {
      this.newConversationSubject.next(conversation);
    });
  }

  public joinConversation(conversationId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('JoinConversation', conversationId)
        .then(() => console.log(`Joined conversation: ${conversationId}`))
        .catch(err => console.error('Error joining conversation: ', err));
    }
  }

  public leaveConversation(conversationId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('LeaveConversation', conversationId)
        .catch(err => console.error('Error leaving conversation: ', err));
    }
  }

  public sendTypingIndicator(conversationId: string, isTyping: boolean): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('SendTypingIndicator', conversationId, isTyping)
        .catch(err => console.error('Error sending typing indicator: ', err));
    }
  }

  public markMessagesAsRead(conversationId: string, messageIds: string[]): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke('MarkMessagesAsRead', conversationId, messageIds)
        .catch(err => console.error('Error marking messages as read: ', err));
    }
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log('SignalR Stopped'))
        .catch(err => console.error('Error stopping SignalR: ', err));
    }
  }
}
