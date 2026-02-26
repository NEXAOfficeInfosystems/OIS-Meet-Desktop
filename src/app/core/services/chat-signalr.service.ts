import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
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

export interface QueuedMessage {
  request: SendMessageRequest;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: any) => void;
  retryCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChatSignalrService {
  private hubConnection!: signalR.HubConnection;
  private messageReceivedSubject = new BehaviorSubject<any>(null);
  private userTypingSubject = new BehaviorSubject<{ userId: string, isTyping: boolean } | null>(null);
  private messageStatusSubject = new BehaviorSubject<{ messageId: string, status: string } | null>(null);
  private userOnlineSubject = new BehaviorSubject<string | null>(null);
  private userOfflineSubject = new BehaviorSubject<string | null>(null);
  private messageDeletedSubject = new BehaviorSubject<string | null>(null);
  private messagesReadSubject = new BehaviorSubject<any>(null);
  private newConversationSubject = new BehaviorSubject<any>(null);
  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  // Message queue for when connection is reconnecting
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue = false;
  private maxRetryCount = 3;

  messageReceived$ = this.messageReceivedSubject.asObservable();
  userTyping$ = this.userTypingSubject.asObservable();
  messageStatus$ = this.messageStatusSubject.asObservable();
  userOnline$ = this.userOnlineSubject.asObservable();
  userOffline$ = this.userOfflineSubject.asObservable();
  messageDeleted$ = this.messageDeletedSubject.asObservable();
  messagesRead$ = this.messagesReadSubject.asObservable();
  newConversation$ = this.newConversationSubject.asObservable();
  connectionState$ = this.connectionStateSubject.asObservable();

  startConnection(userId: string | null): void {
    if (!userId) {
      console.error('Cannot start connection: No userId provided');
      return;
    }

    // Don't start if already connecting/connected
    if (this.hubConnection &&
        (this.hubConnection.state === signalR.HubConnectionState.Connected ||
         this.hubConnection.state === signalR.HubConnectionState.Connecting)) {
      console.log('Connection already exists in state:', this.hubConnection.state);
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    const url = `${baseUrl}/hubs/chat?userId=${userId}`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000]) // Custom retry intervals
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Monitor connection state changes
    this.hubConnection.onreconnecting((error) => {
      console.log('Connection reconnecting...', error);
      this.connectionStateSubject.next(signalR.HubConnectionState.Reconnecting);
    });

    this.hubConnection.onreconnected((connectionId) => {
      console.log('Connection reconnected', connectionId);
      this.connectionStateSubject.next(signalR.HubConnectionState.Connected);
      this.registerChatEvents(); // Re-register events after reconnection
      this.processMessageQueue(); // Process any queued messages
    });

    this.hubConnection.onclose((error) => {
      console.log('Connection closed', error);
      this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);

      // Reject all queued messages when connection closes permanently
      this.rejectAllQueuedMessages('Connection closed permanently');
    });

    this.hubConnection
      .start()
      .then(() => {
        console.log("✅ SignalR Connected");
        this.connectionStateSubject.next(signalR.HubConnectionState.Connected);
        this.registerChatEvents();
      })
      .catch(err => {
        console.error("Connection Error:", err);
        this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
      });
  }

  private registerChatEvents(): void {
    // Remove all existing handlers first to avoid duplicates
    this.hubConnection.off('MessageReceived');
    this.hubConnection.off('UserTyping');
    this.hubConnection.off('MessageStatus');
    this.hubConnection.off('UserOnline');
    this.hubConnection.off('UserOffline');
    this.hubConnection.off('MessageDeleted');
    this.hubConnection.off('MessagesRead');
    this.hubConnection.off('NewConversation');

    // Handle new messages
    this.hubConnection.on('MessageReceived', (message: any) => {
      console.log('📨 Message received:', message);
      this.messageReceivedSubject.next(message);
    });

    // Handle typing indicators
    this.hubConnection.on('UserTyping', (data: { userId: string, isTyping: boolean }) => {
      console.log('👤 User typing:', data);
      this.userTypingSubject.next(data);
    });

    // Handle message status updates
    this.hubConnection.on('MessageStatus', (data: { messageId: string, status: string }) => {
      this.messageStatusSubject.next(data);
    });

    // Handle user online status
    this.hubConnection.on('UserOnline', (userId: string) => {
      console.log('🟢 User online:', userId);
      this.userOnlineSubject.next(userId);
    });

    this.hubConnection.on('UserOffline', (userId: string) => {
      console.log('🔴 User offline:', userId);
      this.userOfflineSubject.next(userId);
    });

    // Handle deleted messages
    this.hubConnection.on('MessageDeleted', (messageId: string) => {
      this.messageDeletedSubject.next(messageId);
    });

    // Handle messages read receipts
    this.hubConnection.on('MessagesRead', (data: any) => {
      this.messagesReadSubject.next(data);
    });

    // Handle new conversation
    this.hubConnection.on('NewConversation', (conversation: any) => {
      this.newConversationSubject.next(conversation);
    });
  }

  // Chat methods with queue support
  async sendMessage(message: SendMessageRequest): Promise<void> {
    // Check connection state
    const state = this.hubConnection?.state;

    if (state === signalR.HubConnectionState.Connected) {
      // Connected - send immediately
      try {
        await this.hubConnection.invoke("SendMessage", message);
        console.log('Message sent successfully');
      } catch (err) {
        console.error('Error sending message:', err);
        throw err;
      }
    } else if (state === signalR.HubConnectionState.Reconnecting) {
      // Reconnecting - queue the message
      console.log('Connection reconnecting, queuing message');
      return this.queueMessage(message);
    } else {
      // Disconnected or other state - throw error
      throw new Error(`Cannot send message: Connection is ${state || 'not initialized'}`);
    }
  }

  private queueMessage(request: SendMessageRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        request,
        resolve,
        reject,
        retryCount: 0
      });

      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }
    });
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      // Check if connection is still reconnecting
      if (this.hubConnection?.state !== signalR.HubConnectionState.Connected) {
        console.log('Connection not ready, will retry later');
        break;
      }

      const queuedMessage = this.messageQueue[0];

      try {
        await this.hubConnection.invoke("SendMessage", queuedMessage.request);
        console.log('Queued message sent successfully');
        queuedMessage.resolve();
        this.messageQueue.shift(); // Remove from queue
      } catch (err) {
        console.error('Error sending queued message:', err);

        // Increment retry count
        queuedMessage.retryCount++;

        if (queuedMessage.retryCount >= this.maxRetryCount) {
          // Max retries reached - reject and remove from queue
          console.error('Max retries reached for message, rejecting');
          queuedMessage.reject(err);
          this.messageQueue.shift();
        } else {
          // Leave in queue and break to retry later
          console.log(`Retry ${queuedMessage.retryCount}/${this.maxRetryCount} for message`);
          break;
        }
      }
    }

    this.isProcessingQueue = false;

    // If there are still messages in queue, schedule another processing attempt
    if (this.messageQueue.length > 0) {
      setTimeout(() => this.processMessageQueue(), 2000);
    }
  }

  private rejectAllQueuedMessages(error: string): void {
    while (this.messageQueue.length > 0) {
      const queuedMessage = this.messageQueue.shift();
      if (queuedMessage) {
        queuedMessage.reject(new Error(error));
      }
    }
  }

  sendTypingIndicator(conversationId: string, isTyping: boolean): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("TypingIndicator", conversationId, isTyping)
        .catch(err => console.error('Error sending typing indicator:', err));
    }
  }

  async markMessagesAsRead(conversationId: string, messageIds: string[]): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.hubConnection.invoke('MarkMessagesAsRead', conversationId, messageIds);
      } catch (err) {
        console.error('Error marking messages as read:', err);
        throw err;
      }
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.hubConnection.invoke('DeleteMessage', messageId);
      } catch (err) {
        console.error('Error deleting message:', err);
        throw err;
      }
    }
  }

  joinConversation(conversationId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("JoinConversation", conversationId)
        .catch(err => console.error('Error joining conversation:', err));
    } else {
      console.log('Cannot join conversation: Connection not ready');
    }
  }

  leaveConversation(conversationId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("LeaveConversation", conversationId)
        .catch(err => console.error('Error leaving conversation:', err));
    }
  }

  isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  isReconnecting(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Reconnecting;
  }

  getConnectionState(): signalR.HubConnectionState {
    return this.hubConnection?.state || signalR.HubConnectionState.Disconnected;
  }

  stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log('Connection stopped'))
        .catch(err => console.error('Error stopping connection:', err));
    }
  }
}
