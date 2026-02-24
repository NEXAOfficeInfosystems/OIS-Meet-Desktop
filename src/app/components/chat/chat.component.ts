import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';

// Services
import { ChatService, ChatUser, Message, SendMessageRequest, Conversation, ApiResponse } from '../../core/services/chat.service';
import { SignalRService } from '../../core/services/signalr.service';
import { SessionService } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';
import { CommonService } from '../../core/services/common.service';
import { SsoApiService } from '../../core/services/sso-api.service';
import { FileSizePipe } from '../../core/pipes/file-size.pipe';

// Pipes

// Declare bootstrap for modal
declare var bootstrap: any;

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    FileSizePipe
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  // User data
  users: ChatUser[] = [];
   ssoUsers: any[] = [];
  filteredUsers: ChatUser[] = [];
  selectedUser: ChatUser | null = null;
  selectedConversation: Conversation | null = null;
  currentUserId: string = '';

  // Messages
  messages: Message[] = [];
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

  // Cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatService,
    private signalRService: SignalRService,
    private authService: AuthService,
    private sessionService: SessionService,
    private commonService: CommonService,
    private ssoApiService: SsoApiService,
    private commonSvc: CommonService
  ) {
     const userId = this.sessionService.getUserId() ?? '11111111-1111-1111-1111-111111111111';
    this.currentUserId = userId;
  }

ngOnInit() {
  this.signalRService.startConnection(this.currentUserId);
  this.setupSignalREvents();
  this.loadConversations();
  this.getSSOUserList();

}

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.signalRService.stopConnection();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Helper method to get display name
  getUserDisplayName(user: ChatUser): string {
    return user?.fullName || 'Unknown';
  }

  private setupSignalREvents(): void {
    // Handle new messages
    this.signalRService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.handleNewMessage(message);
      });

    // Handle typing indicators
    this.signalRService.userTyping$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (this.selectedUser?.userId === data.userId) {
          this.isTyping = data.isTyping;
          // Auto-hide typing indicator after 3 seconds
          setTimeout(() => this.isTyping = false, 3000);
        }
      });

    // Handle message status updates
    this.signalRService.messageStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.updateMessageStatus(data.messageId, data.status);
      });

    // Handle user online/offline status
    this.signalRService.userOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => {
        this.updateUserOnlineStatus(userId, true);
      });

    this.signalRService.userOffline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => {
        this.updateUserOnlineStatus(userId, false);
      });

    // Handle deleted messages
    this.signalRService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messageId => {
        this.deleteMessageFromUI(messageId);
      });

    // Handle new conversations
    this.signalRService.newConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversation => {
        this.addNewConversation(conversation);
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
  this.isLoading = true;
  this.chatService.getConversations()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response: ApiResponse<ChatUser[]>) => {
        if (response.success) {
          console.log(`✅ Loaded ${response.data.length} conversations from server`);

          // If we have SSO users, merge with server data
          if (this.users.length > 0) {
            this.mergeConversationData(response.data);
          } else {
            // No SSO users yet, use server data directly
            this.users = response.data.map(user => ({
              ...user,
              name: user.fullName,
              online: user.isOnline
            }));
            this.filteredUsers = [...this.users];

            if (this.users.length > 0 && !this.selectedUser) {
              this.selectUser(this.users[0]);
            }
          }

          this.loadUnreadCount();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading conversations:', error);
        this.isLoading = false;
        // Don't fallback to mock data, just show error
        // this.commonSvc.showError('Failed to load conversations');
      }
    });
}

  loadUnreadCount(): void {
    this.chatService.getUnreadCount()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ApiResponse<number>) => {
          if (response.success) {
            this.totalUnreadCount = response.data;
          }
        },
        error: (error) => console.error('Error loading unread count:', error)
      });
  }

  // Update selectUser method to handle case when conversation is not yet created
  selectUser(user: ChatUser): void {
    this.selectedUser = user;
    this.messages = [];
    this.currentPage = 1;
    this.hasMoreMessages = true;

    // If we already have conversationId, use it
    if (user.conversationId) {
      this.selectedConversation = { id: user.conversationId } as Conversation;
      this.signalRService.joinConversation(user.conversationId);
      this.loadMessages(user.conversationId);
      user.unreadCount = 0;
      this.markConversationAsRead();
    } else {
      // Get or create conversation
      this.chatService.getOrCreateConversation(user.userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: ApiResponse<Conversation>) => {
            if (response.success) {
              this.selectedConversation = response.data;
              user.conversationId = response.data.id;

              // Join conversation room in SignalR
              this.signalRService.joinConversation(this.selectedConversation!.id);

              // Load messages
              this.loadMessages(this.selectedConversation!.id);

              // Reset unread count for this user
              user.unreadCount = 0;

              // Mark conversation as read
              this.markConversationAsRead();
            }
          },
          error: (error) => {
            console.error('Error getting conversation:', error);
            // this.commonSvc.showError('Failed to open conversation');
          }
        });
    }
  }

  loadMessages(conversationId: string): void {
    this.isLoading = true;
    this.chatService.getMessages(conversationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ApiResponse<Message[]>) => {
          if (response.success) {
            // Prepend older messages (they come in reverse chronological order)
            const newMessages = response.data.reverse();
            this.messages = [...newMessages, ...this.messages];
            this.hasMoreMessages = response.data.length === 50; // page size

            // Mark messages as read
            if (this.messages.length > 0) {
              this.markVisibleMessagesAsRead();
            }
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading messages:', error);
          this.isLoading = false;
          // this.commonSvc.showError('Failed to load messages');
        }
      });
  }

  loadMoreMessages(): void {
    if (!this.hasMoreMessages || this.isLoading || !this.selectedConversation) return;
    this.currentPage++;
    this.loadMessages(this.selectedConversation.id);
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedConversation || !this.selectedUser) return;

    const request: SendMessageRequest = {
      conversationId: this.selectedConversation.id,
      messageType: 'Text',
      content: this.newMessage.trim()
    };

    this.chatService.sendMessage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ApiResponse<Message>) => {
          if (response.success) {
            this.messages.push(response.data);
            this.newMessage = '';

            // Update user's last message in sidebar
            const user = this.users.find(u => u.id === this.selectedUser?.id);
            if (user) {
              user.lastMessage = response.data.content;
              user.lastMessageTime = this.formatMessageTime(new Date(response.data.sentAt));
              user.lastMessageType = 'Text';
            }

            this.scrollToBottom();
          }
        },
        error: (error) => {
          console.error('Error sending message:', error);
          // this.commonSvc.showError('Failed to send message');
        }
      });
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

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      // this.commonSvc.showError('File size exceeds 10MB limit');
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
        attachments: [{
          fileName: file.name,
          fileData: base64Data,
          fileSize: file.size,
          mimeType: file.type
        }]
      };

      this.chatService.sendMessage(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: ApiResponse<Message>) => {
            if (response.success) {
              this.messages.push(response.data);

              // Update user's last message in sidebar
              const user = this.users.find(u => u.id === this.selectedUser?.id);
              if (user) {
                user.lastMessage = file.type.startsWith('image/') ? '📷 Image' : `📎 ${file.name}`;
                user.lastMessageTime = this.formatMessageTime(new Date());
                user.lastMessageType = file.type.startsWith('image/') ? 'Image' : 'File';
              }

              this.scrollToBottom();
            }
            this.isSendingFile = false;
          },
          error: (error) => {
            console.error('Error sending file:', error);
            // this.commonSvc.showError('Failed to send file');
            this.isSendingFile = false;
          }
        });
    };
    reader.readAsDataURL(file);
  }

  onTyping(): void {
    if (!this.selectedConversation) return;

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.signalRService.sendTypingIndicator(this.selectedConversation.id, true);

    this.typingTimeout = setTimeout(() => {
      this.signalRService.sendTypingIndicator(this.selectedConversation!.id, false);
    }, 1000);
  }

  private handleNewMessage(message: Message): void {
    // Add message to current conversation if selected
    if (this.selectedConversation?.id === message.conversationId) {
      this.messages.push(message);
      this.scrollToBottom();

      // Mark message as read after a short delay
      setTimeout(() => {
        this.markMessageAsRead(message.id);
      }, 1000);
    }

    // Update user's last message in sidebar
    const user = this.users.find(u => u.userId === message.senderId);
    if (user) {
      user.lastMessage = message.messageType === 'Text' ? message.content :
                        message.messageType === 'Image' ? '📷 Image' :
                        `📎 ${message.fileName || 'File'}`;
      user.lastMessageTime = this.formatMessageTime(new Date(message.sentAt));
      user.lastMessageType = message.messageType;

      if (this.selectedUser?.userId !== message.senderId) {
        user.unreadCount++;
        this.totalUnreadCount++;
      }
    } else {
      // New user/conversation - refresh list
      this.loadConversations();
    }
  }

  private markMessageAsRead(messageId: string): void {
    if (!this.selectedConversation) return;

    const request = {
      messageId: messageId,
      status: 'Read' as const
    };

    this.chatService.updateMessageStatus(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    // Notify others via SignalR
    this.signalRService.markMessagesAsRead(this.selectedConversation.id, [messageId]);
  }

  private markVisibleMessagesAsRead(): void {
    if (!this.selectedConversation || this.messages.length === 0) return;

    const unreadMessages = this.messages
      .filter(m => m.senderId !== this.currentUserId && !m.isRead)
      .map(m => m.id);

    if (unreadMessages.length > 0) {
      this.signalRService.markMessagesAsRead(this.selectedConversation.id, unreadMessages);

      // Update status locally
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

    this.chatService.markConversationAsRead(this.selectedConversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
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

  private addNewConversation(conversation: Conversation): void {
    // Extract the other participant
    const otherUser = conversation.participants[0];
    if (otherUser && !this.users.find(u => u.userId === otherUser.userId)) {
      this.users.unshift(otherUser);
      this.filteredUsers = [...this.users];
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  downloadAttachment(attachment: any): void {
    if (!attachment) return;

    // Open in new tab or trigger download
    window.open(attachment.fileUrl, '_blank');
  }

  viewImage(message: Message): void {
    this.selectedImage = {
      fileName: message.fileName || message.attachments?.[0]?.fileName,
      fileUrl: message.fileUrl || message.attachments?.[0]?.fileUrl
    };

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
    modal.show();
  }

  startVoiceCall(): void {
    if (this.selectedUser) {
      console.log('Starting voice call with:', this.getUserDisplayName(this.selectedUser));
      // Implement voice call logic
      // this.commonSvc.showInfo('Voice call feature coming soon');
    }
  }

  startVideoCall(): void {
    if (this.selectedUser) {
      console.log('Starting video call with:', this.getUserDisplayName(this.selectedUser));
      // Implement video call logic
      // this.commonSvc.showInfo('Video call feature coming soon');
    }
  }

  showUserInfo(): void {
    if (this.selectedUser) {
      console.log('Showing info for:', this.getUserDisplayName(this.selectedUser));
      // Implement user info modal
      // this.commonSvc.showInfo('User info feature coming soon');
    }
  }

  showEmojiPicker(): void {
    // Implement emoji picker
    console.log('Emoji picker clicked');
    // this.commonSvc.showInfo('Emoji picker coming soon');
  }

  private scrollToBottom(): void {
    try {
      if (this.chatMessagesContainer) {
        const element = this.chatMessagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
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

  // Legacy method - keep for backward compatibility
  getSSOUserList(): void {
    const token = this.authService.getSSOToken() ?? '';
    const userinfo = this.authService.getEncryptedJson() ?? '';
    const client = this.sessionService.getClientId() ?? '';
    const companyId = this.sessionService.getCompanyId()?.toString() ?? '';
    const appId = this.sessionService.getMeetAppId() ?? '';

    this.isLoading = true;
    console.log('Fetching SSO user list...');

    this.ssoApiService.getSSOUserList(token, userinfo, client, companyId, appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any[]) => {
          console.log(`✅ Fetched ${response.length} SSO users successfully`);
          this.ssoUsers = response;

          // Transform SSO users to ChatUser format
          this.users = this.transformSSOUsersToChatUsers(response);
          this.filteredUsers = [...this.users];

          // Initialize conversations for these users
          this.initializeConversations();
        },
        error: (error) => {
          console.error('❌ Error fetching SSO user list:', error);
          this.isLoading = false;
          // Show error message to user
          // this.commonSvc.showError('Failed to load users. Please try again.');
        }
      });
  }
  private transformSSOUsersToChatUsers(ssoUsers: any[]): ChatUser[] {
    return ssoUsers.map(user => ({
      id: user.id,
      userId: user.id,
      name: user.fullName,
      fullName: user.fullName,
      email: user.email,
      isOnline: true, // SSO users are considered online by default
      online: true,
      lastMessage: '',
      lastMessageTime: '',
      lastMessageType: '',
      unreadCount: 0,
      avatarColor: this.commonSvc.getRandomColor(),
      status: 'Available'
    }));
  }

  private initializeConversations(): void {
    if (this.users.length === 0) {
      console.log('No users to initialize conversations');
      this.isLoading = false;
      return;
    }

    console.log(`Initializing conversations for ${this.users.length} users`);

    // Track how many conversations are initialized
    let initializedCount = 0;
    const totalUsers = this.users.length;

    // Initialize conversation for each user
    this.users.forEach(user => {
      this.chatService.getOrCreateConversation(user.userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: ApiResponse<Conversation>) => {
            initializedCount++;

            if (response.success) {
              console.log(`✅ Conversation initialized for user: ${user.fullName}`);

              // Update user's conversation ID if needed
              user.conversationId = response.data.id;
            }

            // Check if all conversations are initialized
            if (initializedCount === totalUsers) {
              this.onAllConversationsInitialized();
            }
          },
          error: (error) => {
            initializedCount++;
            console.error(`❌ Error initializing conversation for user ${user.fullName}:`, error);

            // Check if all conversations are initialized (even with errors)
            if (initializedCount === totalUsers) {
              this.onAllConversationsInitialized();
            }
          }
        });
    });
  }

   private onAllConversationsInitialized(): void {
    console.log('✅ All conversations initialized');
    this.isLoading = false;

    // Load actual conversations from the server
    this.loadConversationsFromServer();
  }

   private loadConversationsFromServer(): void {
    console.log('Loading conversations from server...');

    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ApiResponse<ChatUser[]>) => {
          if (response.success && response.data.length > 0) {
            console.log(`✅ Loaded ${response.data.length} conversations from server`);

            // Merge server data with SSO user data
            this.mergeConversationData(response.data);
          } else {
            console.log('No existing conversations found, using SSO users');
            // Just use the SSO users we already have
            this.filteredUsers = [...this.users];

            if (this.users.length > 0 && !this.selectedUser) {
              this.selectUser(this.users[0]);
            }
          }
        },
        error: (error) => {
          console.error('Error loading conversations from server:', error);
          // Still use SSO users even if server fails
          this.filteredUsers = [...this.users];

          if (this.users.length > 0 && !this.selectedUser) {
            this.selectUser(this.users[0]);
          }
        }
      });
  }

  private mergeConversationData(serverUsers: ChatUser[]): void {
    // Create a map of server users by userId for quick lookup
    const serverUserMap = new Map(serverUsers.map(u => [u.userId, u]));

    // Merge server data with SSO users
    this.users = this.users.map(ssoUser => {
      const serverUser = serverUserMap.get(ssoUser.userId);
      if (serverUser) {
        // Merge server data (like lastMessage, unreadCount) with SSO user
        return {
          ...ssoUser,
          lastMessage: serverUser.lastMessage || '',
          lastMessageTime: serverUser.lastMessageTime || '',
          lastMessageType: serverUser.lastMessageType || '',
          unreadCount: serverUser.unreadCount || 0,
          // Preserve conversation ID
          conversationId: serverUser.conversationId
        };
      }
      return ssoUser;
    });

    this.filteredUsers = [...this.users];

    // Auto-select first user if none selected
    if (this.users.length > 0 && !this.selectedUser) {
      this.selectUser(this.users[0]);
    }

    // Load unread count
    this.loadUnreadCount();
  }
  // Add this method to your ChatComponent
getFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
}
