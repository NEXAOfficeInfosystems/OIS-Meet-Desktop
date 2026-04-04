import { Injectable, signal, computed, NgZone } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SendMessageRequest {
  conversationId: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  content: string;
  replyToMessageId?: string;
  senderId: string | null;
  attachments?: {
    fileName: string;
    fileData: string;
    fileSize: number;
    mimeType: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatSignalrService {
  private hubConnection!: signalR.HubConnection;
  
  // Connection State
  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  connectionState$ = this.connectionStateSubject.asObservable();
  connectionState = signal<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);

  // Core Events
  private messageReceivedSubject = new Subject<any>();
  private messageUpdatedSubject = new Subject<any>();
  private messageDeletedSubject = new Subject<string>();
  private messageStatusSubject = new Subject<any>();
  
  // Presence & Activity
  private userOnlineSubject = new Subject<string>();
  private userOfflineSubject = new Subject<string>();
  private activeUsersListSubject = new BehaviorSubject<string[]>([]);
  private userTypingSubject = new Subject<any>();
  private newActivitySubject = new Subject<any>();

  // Conversation Management
  private newConversationSubject = new Subject<any>();
  private memberAddedSubject = new Subject<string>();
  private groupInfoUpdatedSubject = new Subject<any>();

  // Reactions
  private reactionAddedSubject = new Subject<any>();
  private reactionRemovedSubject = new Subject<any>();

  // Public Observables
  messageReceived$ = this.messageReceivedSubject.asObservable();
  messageUpdated$ = this.messageUpdatedSubject.asObservable();
  messageDeleted$ = this.messageDeletedSubject.asObservable();
  messageStatus$ = this.messageStatusSubject.asObservable();
  
  userOnline$ = this.userOnlineSubject.asObservable();
  userOffline$ = this.userOfflineSubject.asObservable();
  activeUsersList$ = this.activeUsersListSubject.asObservable();
  userTyping$ = this.userTypingSubject.asObservable();
  newActivity$ = this.newActivitySubject.asObservable();

  newConversation$ = this.newConversationSubject.asObservable();
  memberAdded$ = this.memberAddedSubject.asObservable();
  groupInfoUpdated$ = this.groupInfoUpdatedSubject.asObservable();

  reactionAdded$ = this.reactionAddedSubject.asObservable();
  reactionRemoved$ = this.reactionRemovedSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  startConnection(userId: string | null): void {
    if (!userId) return;

    if (this.hubConnection && (
      this.hubConnection.state === signalR.HubConnectionState.Connected ||
      this.hubConnection.state === signalR.HubConnectionState.Connecting
    )) return;

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    const url = `${baseUrl}/hubs/chat?userId=${userId}`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.registerEvents();

    this.hubConnection.start()
      .then(() => {
        console.log('✅ Chat SignalR Connected');
        this.updateState(signalR.HubConnectionState.Connected);
      })
      .catch(err => {
        console.error('❌ Chat SignalR Connection Error:', err);
        this.updateState(signalR.HubConnectionState.Disconnected);
      });

    this.hubConnection.onreconnecting(() => this.updateState(signalR.HubConnectionState.Reconnecting));
    this.hubConnection.onreconnected(() => this.updateState(signalR.HubConnectionState.Connected));
    this.hubConnection.onclose(() => this.updateState(signalR.HubConnectionState.Disconnected));
  }

  private updateState(state: signalR.HubConnectionState): void {
    this.ngZone.run(() => {
      this.connectionState.set(state);
      this.connectionStateSubject.next(state);
    });
  }

  private registerEvents(): void {
    const hub = this.hubConnection;

    hub.on('ReceiveMessage', (msg: any) => this.ngZone.run(() => this.messageReceivedSubject.next(msg)));
    hub.on('MessageReceived', (msg: any) => this.ngZone.run(() => this.messageReceivedSubject.next(msg)));
    hub.on('MessageUpdated', (msg: any) => this.ngZone.run(() => this.messageUpdatedSubject.next(msg)));
    hub.on('MessageDeleted', (id: string) => this.ngZone.run(() => this.messageDeletedSubject.next(id)));
    hub.on('MessagesRead', (data: any) => this.ngZone.run(() => this.messageStatusSubject.next(data)));
    hub.on('MessagesReadAll', (data: any) => this.ngZone.run(() => this.messageStatusSubject.next(data)));

    hub.on('UserOnline', (userId: string) => this.ngZone.run(() => this.userOnlineSubject.next(userId)));
    hub.on('UserOffline', (userId: string) => this.ngZone.run(() => this.userOfflineSubject.next(userId)));
    hub.on('ActiveUsersList', (userIds: string[]) => this.ngZone.run(() => this.activeUsersListSubject.next(userIds)));
    hub.on('UserTyping', (data: any) => this.ngZone.run(() => this.userTypingSubject.next(data)));
    hub.on('NewActivity', (activity: any) => this.ngZone.run(() => this.newActivitySubject.next(activity)));

    hub.on('NewConversation', (conv: any) => this.ngZone.run(() => this.newConversationSubject.next(conv)));
    hub.on('MemberAdded', (convId: string) => this.ngZone.run(() => this.memberAddedSubject.next(convId)));
    hub.on('GroupInfoUpdated', (data: any) => this.ngZone.run(() => this.groupInfoUpdatedSubject.next(data)));

    hub.on('ReactionAdded', (reaction: any) => this.ngZone.run(() => this.reactionAddedSubject.next(reaction)));
    hub.on('ReactionRemoved', (reaction: any) => this.ngZone.run(() => this.reactionRemovedSubject.next(reaction)));
  }

  // Invocation Methods
  async joinContext(id: string): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('JoinContext', id);
  }

  async leaveContext(id: string): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('LeaveContext', id);
  }

  async joinConversation(id: string): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('JoinConversation', id);
  }

  async sendTypingIndicator(conversationId: string, isTyping: boolean): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('TypingIndicator', conversationId, isTyping);
  }

  async markAllMessagesAsRead(conversationId: string): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('MarkAllMessagesAsRead', conversationId);
  }

  async sendMessage(msg: SendMessageRequest): Promise<void> {
    if (this.isConnected()) return this.hubConnection.invoke('SendMessage', msg);
  }

  isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}
