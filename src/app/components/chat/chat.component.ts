import { StorageService } from './../../core/services/storage.service';
import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';

// Services
import { SessionService } from '../../core/services/session.service';
import { CommonService } from '../../core/services/common.service';
import { UserService } from '../../core/services/user.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatSignalrService, SendMessageRequest } from '../../core/services/chat-signalr.service';

// Declare bootstrap for modal
declare var bootstrap: any;

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  // User data
  users: any[] = [];
  ssoUsers: any[] = [];
  filteredUsers: any[] = [];
  selectedUser: any | null = null;
  selectedConversation: any | null = null;
  currentUserId: string | null = null;

  // Messages
  messages: any[] = [];
  newMessage = '';

  // UI States
  isLoading = false;
  isSendingFile = false;
  currentPage = 1;
  hasMoreMessages = true;
  isTyping = false;
  totalUnreadCount = 0;

  // Typing indicator
  private typingTimeout: any;

  // Search
  searchQuery = '';

  // Image viewer
  selectedImage: any = null;
  private companySubscription!: Subscription;
  private syncSubscription!: Subscription;
  private isCompanyChanging = false;

  // Cleanup
  private destroy$ = new Subject<void>();
 private connectionStateSubscription: Subscription;
  constructor(
    private sessionService: SessionService,
    private commonService: CommonService,
    private userService: UserService,
    private storageService: StorageService,
    private chatService: ChatService,
    private chatSignalrService: ChatSignalrService
  ) {
    this.connectionStateSubscription = this.chatSignalrService.connectionState$.subscribe(
      state => {
        console.log('SignalR connection state changed:', state);
        if (state === signalR.HubConnectionState.Connected && this.selectedConversation) {
          // Rejoin conversation if connection is reestablished
          this.chatSignalrService.joinConversation(this.selectedConversation.id);
        }
      }
    );
  }

  ngOnInit() {
    this.currentUserId =  this.sessionService.getOISMeetUserId() || null;
     if (this.currentUserId) {
      this.chatSignalrService.startConnection(this.currentUserId);
    }
    // Check if we have a pending company change
    const pendingCompanyId = sessionStorage.getItem('selectedCompanyId');
    if (pendingCompanyId) {
      console.log('⏳ Pending company change detected, waiting for sync...');
      this.isCompanyChanging = true;
      this.isLoading = true;
    } else {
      // Initial load
      this.loadUsersForCurrentCompany();
      this.loadConversations();
    }
    // Listen for company changes
    this.companySubscription = this.commonService.companyChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(company => {
        console.log('🏢 Company changing to:', company);
        this.handleCompanyChange();
      });

    // Listen for sync completion
    this.syncSubscription = this.commonService.syncComplete$
      .pipe(takeUntil(this.destroy$))
      .subscribe(company => {
        console.log('✅ Sync completed for company:', company);
        this.handleSyncComplete();
      });
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy() {
        if (this.connectionStateSubscription) {
      this.connectionStateSubscription.unsubscribe();
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.chatSignalrService.stopConnection();
    this.destroy$.next();
    this.destroy$.complete();

    if (this.companySubscription) {
      this.companySubscription.unsubscribe();
    }
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
    }
  }

  private handleCompanyChange() {
    // Clear current data immediately
    this.users = [];
    this.filteredUsers = [];
    this.selectedUser = null;
    this.messages = [];
    this.isLoading = true;
    this.isCompanyChanging = true;
  }

  private handleSyncComplete() {
    console.log('🔄 Sync complete, now loading users...');
    this.isCompanyChanging = false;
    sessionStorage.removeItem('selectedCompanyId');
    this.loadUsersForCurrentCompany();
    this.loadConversations();
  }

  private loadUsersForCurrentCompany(): void {
    if (this.isCompanyChanging) {
      console.log('⏳ Company still changing, waiting before loading users...');
      return;
    }

    this.isLoading = true;

    const clientId = this.sessionService.getClientId() ?? '';
    const companyId = this.sessionService.getCompanyId() ?? 0;

    this.userService.getOisMeetUsers(clientId, companyId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            console.log('✅ Loaded users:', res.data);
            const loggedInSSOUserId = this.sessionService.getUserId() || '';
            const currentUser = res.data.find(
              (u: any) => u.ssoUserId === loggedInSSOUserId
            );

            if (currentUser) {
              this.storageService.setItem('oisMeetUserId', currentUser.id);
              console.log('✅ OIS Meet UserId stored:', currentUser.id);
              this.currentUserId = currentUser.id; // Update currentUserId
              // this.chatSignalrService.startConnection(this.currentUserId);
              this.setupSignalREvents();
            }

            const transformed = this.transformSSOUsersToChatUsers(res.data);

            // Exclude logged-in user
            this.users = transformed.filter(
              (user: any) => user.id !== this.currentUserId
            );

            this.filteredUsers = [...this.users];
            console.log(`📋 Displaying ${this.users.length} users`);
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('❌ Failed to load users', err);
          this.isLoading = false;
          setTimeout(() => {
            if (!this.isCompanyChanging) {
              this.loadUsersForCurrentCompany();
            }
          }, 2000);
        }
      });
  }

  private transformSSOUsersToChatUsers(users: any[]): any[] {
    return users.map(user => ({
      id: user.id,
      userId: user.ssoUserId || user.id,
      name: user.fullName || user.name || 'Unknown',
      fullName: user.fullName || user.name || 'Unknown',
      email: user.email || '',
      isOnline: true,
      online: true,
      lastMessage: '',
      lastMessageTime: '',
      lastMessageType: '',
      unreadCount: 0,
      avatarColor: this.commonService.getRandomColor(),
      status: 'Available',
      clientId: user.clientId,
      companyId: user.companyId
    }));
  }

  getUserDisplayName(user: any): string {
    return user?.fullName || user?.name || 'Unknown';
  }

  private setupSignalREvents(): void {
    this.chatSignalrService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.handleNewMessage(message);
      });

    this.chatSignalrService.userTyping$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data && this.selectedUser?.userId === data.userId) {
          this.isTyping = data.isTyping;
          setTimeout(() => this.isTyping = false, 3000);
        }
      });

    this.chatSignalrService.messageStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data) {
          this.updateMessageStatus(data.messageId, data.status);
        }
      });

    this.chatSignalrService.userOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => {
        if (userId) {
          this.updateUserOnlineStatus(userId, true);
        }
      });

    this.chatSignalrService.userOffline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => {
        if (userId) {
          this.updateUserOnlineStatus(userId, false);
        }
      });

    this.chatSignalrService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messageId => {
        if (messageId) {
          this.deleteMessageFromUI(messageId);
        }
      });

    this.chatSignalrService.newConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversation => {
        if (conversation) {
          this.addNewConversation(conversation);
        }
      });
  }

  searchUsers(event: any): void {
    const query = event.target.value.toLowerCase();
    this.filteredUsers = this.users.filter(user =>
      this.getUserDisplayName(user).toLowerCase().includes(query)
    );
  }

  onScroll(event: any): void {
    const element = event.target;
    if (element.scrollTop === 0 && this.hasMoreMessages && !this.isLoading) {
      this.loadMoreMessages();
    }
  }

  loadConversations(): void {
    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const conversations = res.data;
            const usersFromConversations = conversations.map((conv: any) => {
              const otherParticipant = conv.participants?.[0] || {};
              return {
                id: otherParticipant.userId,
                userId: otherParticipant.userId,
                name: otherParticipant.name,
                fullName: otherParticipant.name,
                email: otherParticipant.email,
                isOnline: otherParticipant.isOnline || false,
                lastMessage: conv.lastMessage?.content || '',
                lastMessageTime: conv.lastMessage?.sentAt ? this.formatMessageTime(new Date(conv.lastMessage.sentAt)) : '',
                lastMessageType: conv.lastMessage?.messageType || '',
                unreadCount: conv.unreadCount || 0,
                conversationId: conv.id,
                avatarColor: this.commonService.getRandomColor()
              };
            });

            // Merge with existing users
            const existingUserIds = new Set(this.users.map(u => u.id));
            const newUsers = usersFromConversations.filter((u: any) => !existingUserIds.has(u.id));
            this.users = [...this.users, ...newUsers];
            this.filteredUsers = [...this.users];
          }
        },
        error: (err) => console.error('Failed to load conversations', err)
      });
  }

  loadMessages(conversationId: string): void {
    if (!conversationId) return;

    this.isLoading = true;
    this.chatService.getMessages(conversationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            if (this.currentPage === 1) {
              this.messages = res.data;
              this.shouldScroll = true;
              this.scrollToBottom();
            } else {
              this.messages = [...res.data, ...this.messages];
            }
            this.hasMoreMessages = res.data.length === 50;
            setTimeout(() => this.markVisibleMessagesAsRead(), 1000);
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Failed to load messages', err);
          this.isLoading = false;
        }
      });
  }

  loadUnreadCount(): void {
    // Implement if needed
  }

async selectUser(user: any): Promise<void> {
  console.log('User Selected Details:', user);
  this.selectedUser = user;
  this.messages = [];
  this.currentPage = 1;
  this.hasMoreMessages = true;

  // Leave previous conversation if any
  if (this.selectedConversation) {
    this.chatSignalrService.leaveConversation(this.selectedConversation.id);
  }

  if (user.conversationId) {
    this.selectedConversation = { id: user.conversationId };
    try {
      await this.chatSignalrService.joinConversation(user.conversationId);
      this.loadMessages(user.conversationId);
      user.unreadCount = 0;
      this.totalUnreadCount = this.users.reduce(
        (sum, u) => sum + (u.unreadCount || 0),
        0
      );
    } catch (err) {
      console.error('Failed to join conversation:', err);
    }
  } else {
    this.isLoading = true;
    this.chatService.createOrGetDirectConversation(user.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (res) => {
          if (res.success && res.data) {
            user.conversationId = res.data;
            this.selectedConversation = { id: res.data };
            try {
              await this.chatSignalrService.joinConversation(res.data);
              this.loadMessages(res.data);
            } catch (err) {
              console.error('Failed to join conversation:', err);
            }
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Failed to create conversation', err);
          this.isLoading = false;
        }
      });
  }
}

 async sendMessage(): Promise<void> {
  if (!this.newMessage.trim() || !this.selectedConversation || this.isSendingFile) return;

  if (!this.currentUserId) {
    console.error('No current user ID available');
    return;
  }

  const request: SendMessageRequest = {
    conversationId: this.selectedConversation.id,
    messageType: 'Text',
    content: this.newMessage.trim(),
    senderId: this.currentUserId
  };

  try {
    this.isSendingFile = true;

    // Show appropriate message based on connection state
    if (this.chatSignalrService.isReconnecting()) {
      console.log('Connection reconnecting, message will be sent when connection is restored');
      // You could show a toast notification here
    }

    await this.chatSignalrService.sendMessage(request);
    this.newMessage = '';
  } catch (err: any) {
    console.error('Failed to send message:', err);

    // Check if it's a HubException with a specific message
    if (err.message) {
      if (err.message.includes('Conversation not found')) {
        alert('Conversation not found. Please select the user again.');
        this.selectedConversation = null;
      } else if (err.message.includes('User not in conversation')) {
        alert('You are no longer in this conversation.');
        this.selectedConversation = null;
      } else if (err.message.includes('Connection is Disconnected')) {
        alert('Lost connection to chat. Trying to reconnect...');
        // Try to restart connection
        if (this.currentUserId) {
          this.chatSignalrService.startConnection(this.currentUserId);
        }
      } else {
        alert(`Failed to send message: ${err.message}`);
      }
    } else {
      alert('Failed to send message. Please try again.');
    }
  } finally {
    this.isSendingFile = false;
  }
}

  selectConversation(conversation: any): void {
    if (this.selectedConversation) {
      this.chatSignalrService.leaveConversation(this.selectedConversation.id);
    }

    this.selectedConversation = conversation;

    if (this.chatSignalrService.isConnected()) {
      this.chatSignalrService.joinConversation(conversation.id);
    }
  }
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.sendFile(file);
    }
  }

  sendFile(file: File): void {
    if (!this.selectedConversation || !this.selectedUser) return;

    this.isSendingFile = true;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit');
      this.isSendingFile = false;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];

      const request: SendMessageRequest = {
        conversationId: this.selectedConversation!.id,
        messageType: file.type.startsWith('image/') ? 'Image' : 'File',
        content: '',
        senderId: this.currentUserId,
        attachments: [{
          fileName: file.name,
          fileData: base64Data,
          fileSize: file.size,
          mimeType: file.type
        }]
      };

      this.chatSignalrService.sendMessage(request)
        .then(() => {
          this.isSendingFile = false;
          if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
          }
        })
        .catch(err => {
          console.error('Failed to send file:', err);
          this.isSendingFile = false;
        });
    };
    reader.readAsDataURL(file);
  }

  loadMoreMessages(): void {
    if (!this.hasMoreMessages || this.isLoading || !this.selectedConversation) return;
    this.currentPage++;
    this.loadMessages(this.selectedConversation.id);
  }

onTyping(): void {
  if (!this.selectedConversation || !this.currentUserId) return;

  if (this.typingTimeout) {
    clearTimeout(this.typingTimeout);
  }

  this.chatSignalrService.sendTypingIndicator(this.selectedConversation.id, true);

  this.typingTimeout = setTimeout(() => {
    if (this.selectedConversation) {
      this.chatSignalrService.sendTypingIndicator(this.selectedConversation.id, false);
    }
    this.typingTimeout = null;
  }, 2000); // Increased to 2 seconds
}

private handleNewMessage(message: any): void {

  if (!message || !message.conversationId) {
    console.warn('Invalid message received:', message);
    return;
  }

  const conversationId = message.conversationId;
  const isActiveConversation = this.selectedConversation?.id === conversationId;
  const alreadyExists = this.messages?.some(m => m.id === message.id);
  if (!alreadyExists && isActiveConversation) {
    this.messages.push(message);
    this.shouldScroll = true;
    this.scrollToBottom();

    setTimeout(() => {
      this.markMessageAsRead(message.id);
    }, 500);
  }
  const user = this.users?.find(u => u.conversationId === conversationId);

  if (user) {

    // Preview text
    if (message.messageType === 'Text') {
      user.lastMessage = message.content;
    }
    else if (message.messageType === 'Image') {
      user.lastMessage = '📷 Image';
    }
    else {
      user.lastMessage = `📎 ${message.attachments?.[0]?.fileName || 'File'}`;
    }

    user.lastMessageTime = this.formatMessageTime(
      new Date(message.sentAt)
    );

    user.lastMessageType = message.messageType;

    if (!isActiveConversation) {
      user.unreadCount = (user.unreadCount || 0) + 1;

      this.totalUnreadCount = this.users.reduce(
        (sum, u) => sum + (u.unreadCount || 0),
        0
      );
    }

  } else {
    // Conversation not found — reload once
    console.warn('Conversation not found. Reloading...');
    this.loadConversations();
  }
}

  private markMessageAsRead(messageId: string): void {
    if (!this.selectedConversation) return;

    this.chatService.markMessagesAsRead(this.selectedConversation.id, [messageId])
      .subscribe({
        error: (err) => console.error('Failed to mark message as read:', err)
      });

    this.chatSignalrService.markMessagesAsRead(this.selectedConversation.id, [messageId])
      .catch(err => console.error('Failed to mark message as read via SignalR:', err));
  }

  private markVisibleMessagesAsRead(): void {
    if (!this.selectedConversation || this.messages.length === 0) return;

    const unreadMessages = this.messages
      .filter(m => m.senderId !== this.currentUserId && !m.isRead)
      .map(m => m.id);

    if (unreadMessages.length > 0) {
      this.chatSignalrService.markMessagesAsRead(this.selectedConversation.id, unreadMessages)
        .catch(err => console.error('Failed to mark messages as read:', err));

      unreadMessages.forEach(id => {
        const msg = this.messages.find(m => m.id === id);
        if (msg) {
          msg.isRead = true;
          msg.isDelivered = true;
        }
      });
    }
  }

  private markConversationAsRead(): void {
    if (!this.selectedConversation) return;
    // Implement if needed
  }

  private updateMessageStatus(messageId: string, status: string): void {
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      if (status === 'Read') {
        message.isRead = true;
        message.isDelivered = true;
      } else if (status === 'Delivered') {
        message.isDelivered = true;
      }
    }
  }

  private updateUserOnlineStatus(userId: string, online: boolean): void {
    const user = this.users.find(u => u.userId === userId);
    if (user) {
      user.isOnline = online;
      if (!online) {
        user.lastSeen = new Date();
      }
    }
  }

  private deleteMessageFromUI(messageId: string): void {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages.splice(index, 1);
    }
  }

  private addNewConversation(conversation: any): void {
    const otherUser = conversation.participants?.[0];
    if (otherUser && !this.users.find(u => u.userId === otherUser.userId)) {
      const newUser = {
        ...otherUser,
        id: otherUser.userId,
        conversationId: conversation.id,
        avatarColor: this.commonService.getRandomColor()
      };
      this.users.unshift(newUser);
      this.filteredUsers = [...this.users];
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  downloadAttachment(attachment: any): void {
    if (!attachment) return;
    window.open(attachment.fileUrl, '_blank');
  }

  viewImage(message: any): void {
    this.selectedImage = {
      fileName: message.fileName || message.attachments?.[0]?.fileName,
      fileUrl: message.fileUrl || message.attachments?.[0]?.fileUrl
    };

    const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
    modal.show();
  }

  startVoiceCall(): void {
    if (this.selectedUser) {
      console.log('Starting voice call with:', this.getUserDisplayName(this.selectedUser));
    }
  }

  startVideoCall(): void {
    if (this.selectedUser) {
      console.log('Starting video call with:', this.getUserDisplayName(this.selectedUser));
    }
  }

  showUserInfo(): void {
    if (this.selectedUser) {
      console.log('Showing info for:', this.getUserDisplayName(this.selectedUser));
    }
  }

  showEmojiPicker(): void {
    console.log('Emoji picker clicked');
  }

  private shouldScroll = false;

  private scrollToBottom(): void {
    try {
      if (this.chatMessagesContainer) {
        setTimeout(() => {
          const element = this.chatMessagesContainer.nativeElement;
          element.scrollTop = element.scrollHeight;
        }, 0);
      }
    } catch (err) { }
  }

  formatTime(date: Date): string {
    if (!date) return '';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private formatMessageTime(date: Date): string {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMinutes = Math.floor((now.getTime() - messageDate.getTime()) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}h ago`;
    }
    if (diffMinutes < 2880) return 'Yesterday';
    return messageDate.toLocaleDateString();
  }

  getFileSize(bytes: number | undefined | null): string {
    if (!bytes || bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
