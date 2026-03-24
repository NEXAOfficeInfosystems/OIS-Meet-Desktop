import {
  Component, OnInit, ViewChild, ElementRef,
  AfterViewChecked, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';

import { SessionService } from '../../core/services/session.service';
import { CommonService }  from '../../core/services/common.service';
import { UserService }    from '../../core/services/user.service';
import { StorageService } from '../../core/services/storage.service';
import { ChatService }    from '../../core/services/chat.service';
import { ChatSignalrService, SendMessageRequest } from '../../core/services/chat-signalr.service';

declare var bootstrap: any;

interface InAppToast {
  id:           number;
  senderName:   string;
  preview:      string;
  avatarColor:  string;
  avatarLetter: string;
}

@Component({
  selector:    'app-chat',
  standalone:  true,
  imports:     [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls:   ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;
  @ViewChild('fileInput')    fileInput!: ElementRef;

  // ── User / conversation state ────────────────────────────────────────────
  users:                any[] = [];
  filteredUsers:        any[] = [];
  selectedUser:         any   = null;
  selectedConversation: any   = null;
  currentUserId:        string | null = null;

  // ── Messages ─────────────────────────────────────────────────────────────
  messages:    any[]  = [];
  newMessage:  string = '';

  // ── UI flags ──────────────────────────────────────────────────────────────
  isLoading:        boolean = false;
  isSendingFile:    boolean = false;
  isSendingMessage: boolean = false;   // NEW: thin spinner while hub invoke runs
  currentPage:      number  = 1;
  hasMoreMessages:  boolean = true;
  isTyping:         boolean = false;
  totalUnreadCount: number  = 0;
  searchQuery:      string  = '';
  isConnected:      boolean = false;  // NEW: SignalR connection status

  // ── In-app toasts ─────────────────────────────────────────────────────────
  toasts:              InAppToast[] = [];
  private toastCounter = 0;

  // ── Image viewer ──────────────────────────────────────────────────────────
  selectedImage: any = null;

  // ── Private state ─────────────────────────────────────────────────────────
  private typingTimeout:    any;
  private shouldScroll:     boolean = false;
  private destroy$         = new Subject<void>();
  private isCompanyChanging = false;
  private companySubscription!:         Subscription;
  private syncSubscription!:            Subscription;
  private connectionStateSubscription!: Subscription;
  private shareMeetingIdHandler: ((e: Event) => void) | null = null;

  // ── Deduplication ─────────────────────────────────────────────────────────
  // Tracks message IDs already displayed so SignalR echoes are not double-shown.
  private displayedMessageIds = new Set<string>();

  constructor(
    private sessionService:     SessionService,
    private commonService:      CommonService,
    private userService:        UserService,
    private storageService:     StorageService,
    private chatService:        ChatService,
    private chatSignalrService: ChatSignalrService,
    private cdr:                ChangeDetectorRef
  ) {}

  // ═════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.currentUserId = this.sessionService.getOISMeetUserId() || null;

    if (this.currentUserId) {
      this.chatSignalrService.startConnection(this.currentUserId);
    }

    // ── BUG FIX: subscribe to SignalR events HERE, unconditionally ─────────
    // Previously this was inside loadUsersForCurrentCompany() → inside an
    // "if (currentUser)" branch → frequently never called → receiver got nothing.
    this.setupSignalREvents();

    // Reconnect flow
    this.connectionStateSubscription = this.chatSignalrService.connectionState$.subscribe(state => {
      this.isConnected = state === signalR.HubConnectionState.Connected;
      if (state === signalR.HubConnectionState.Connected) {
        // Reload conversations on reconnect to ensure groups and users are up to date
        this.loadConversations();
      }
    });

    // Company-change flow
    const pendingCompanyId = sessionStorage.getItem('selectedCompanyId');
    if (pendingCompanyId) {
      this.isCompanyChanging = true;
      this.isLoading = true;
    } else {
      this.loadUsersForCurrentCompany();
      this.loadConversations();
    }

    this.companySubscription = this.commonService.companyChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.handleCompanyChange());

    this.syncSubscription = this.commonService.syncComplete$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.handleSyncComplete());

    // Share meeting-ID event from the Meet Now dialog
    this.shareMeetingIdHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.meetingId) this.handleShareMeetingId(detail.meetingId, detail.text);
    };
    window.addEventListener('ois-share-meeting-id', this.shareMeetingIdHandler);

    // Browser notification permission (silent)
    this.requestNotificationPermission();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    this.connectionStateSubscription?.unsubscribe();
    this.companySubscription?.unsubscribe();
    this.syncSubscription?.unsubscribe();
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.shareMeetingIdHandler) {
      window.removeEventListener('ois-share-meeting-id', this.shareMeetingIdHandler);
    }
    this.chatSignalrService.stopConnection();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // COMPANY CHANGE
  // ═════════════════════════════════════════════════════════════════════════

  private handleCompanyChange(): void {
    this.users        = [];
    this.filteredUsers = [];
    this.selectedUser = null;
    this.messages     = [];
    this.isLoading    = true;
    this.isCompanyChanging = true;
    this.displayedMessageIds.clear();
  }

  private handleSyncComplete(): void {
    this.isCompanyChanging = false;
    sessionStorage.removeItem('selectedCompanyId');
    this.loadUsersForCurrentCompany();
    this.loadConversations();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // USER LOADING
  // ═════════════════════════════════════════════════════════════════════════

  private loadUsersForCurrentCompany(): void {
    if (this.isCompanyChanging) return;

    this.isLoading = true;
    const clientId  = this.sessionService.getClientId()  ?? '';
    const companyId = this.sessionService.getCompanyId() ?? 0;
    const appId     = this.sessionService.getMeetAppId() ?? '';

    this.userService.getOisMeetUsers(clientId, companyId, appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const loggedInSSOUserId = this.sessionService.getUserId() || '';
            const currentUser = res.data.find((u: any) => u.ssoUserId === loggedInSSOUserId);

            if (currentUser) {
              this.storageService.setItem('oisMeetUserId', currentUser.id);
              this.currentUserId = currentUser.id;
              // NOTE: setupSignalREvents() is NOT called here anymore — it's
              // called once in ngOnInit() so it works regardless.
            }

            const transformed = this.transformSSOUsersToChatUsers(res.data);
            this.users         = transformed.filter((u: any) => u.id !== this.currentUserId);
            this.filteredUsers = [...this.users];
          }
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          setTimeout(() => { if (!this.isCompanyChanging) this.loadUsersForCurrentCompany(); }, 2000);
        }
      });
  }

  private transformSSOUsersToChatUsers(users: any[]): any[] {
    return users.map(u => ({
      id:              u.id,
      userId:          u.ssoUserId || u.id,
      name:            u.fullName || u.name || 'Unknown',
      fullName:        u.fullName || u.name || 'Unknown',
      email:           u.email || '',
      isOnline:        true,
      lastMessage:     '',
      lastMessageTime: '',
      lastMessageType: '',
      lastMessageAt:   null as Date | null,
      unreadCount:     0,
      avatarColor:     this.commonService.getRandomColor(),
      status:          'Available',
      clientId:        u.clientId,
      companyId:       u.companyId
    }));
  }

  getUserDisplayName(user: any): string {
    return user?.fullName || user?.name || 'Unknown';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SIGNALR EVENT SUBSCRIPTIONS
  // ═════════════════════════════════════════════════════════════════════════

  private setupSignalREvents(): void {
    this.chatSignalrService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => { if (message) this.handleNewMessage(message); });

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
      .subscribe(data => { if (data) this.updateMessageStatus(data.messageId, data.status); });

    this.chatSignalrService.userOnline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => { if (userId) this.updateUserOnlineStatus(userId, true); });

    this.chatSignalrService.userOffline$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userId => { if (userId) this.updateUserOnlineStatus(userId, false); });

    this.chatSignalrService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msgId => { if (msgId) this.deleteMessageFromUI(msgId); });

    this.chatSignalrService.newConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conv => { if (conv) this.addNewConversation(conv); });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // INCOMING MESSAGE HANDLER
  // ═════════════════════════════════════════════════════════════════════════

  private handleNewMessage(message: any): void {
    console.log('🔔 Received message:', message);  // DEBUG: Log incoming messages

    if (!message?.conversationId) return;

    const conversationId     = message.conversationId?.toString() ?? '';
    const msgId              = message.id?.toString()             ?? '';
    const isFromMe           = message.senderId?.toString() === this.currentUserId?.toString();
    const isActiveConversation =
      this.selectedConversation?.id?.toString() === conversationId;

    // ── Deduplication: skip if we already displayed this message id ────────
    // This handles BOTH the receiver (who might somehow get duplicates) AND
    // the sender (the SignalR echo from ChatHub.SendMessage comes back to the
    // sender too — now we just track and skip it cleanly).
    if (msgId && this.displayedMessageIds.has(msgId)) {
      return;
    }
    if (msgId) this.displayedMessageIds.add(msgId);

    // ── Append to message list if this conversation is open ───────────────
    if (isActiveConversation) {
      this.messages  = [...this.messages, message];
      this.shouldScroll = true;
      setTimeout(() => this.markMessageAsRead(msgId), 500);
    }

    // ── Update sidebar preview (for both sender and receiver) ─────────────
    this.updateUserListPreview(conversationId, message);

    // ── Unread count + notifications (receiver only, inactive conversation) ─
    if (!isFromMe && !isActiveConversation) {
      console.log('🔔 Triggering notification: not from me and not active conversation');  // DEBUG: Log notification trigger
      this.incrementUnreadForConversation(conversationId);

      const sender = this.findUserByConversationOrSender(conversationId, message.senderId?.toString());
      console.log('👤 Found sender for notification:', sender, { conversationId, senderId: message.senderId });  // DEBUG: Log sender lookup
      const senderName  = sender ? this.getUserDisplayName(sender) : 'New message';
      const avatarColor = sender?.avatarColor ?? '#1a73e8';
      const preview     =
        message.messageType === 'Text'  ? (message.content ?? '').substring(0, 60) :
        message.messageType === 'Image' ? '📷 Image' : '📎 File';

      this.showInAppToast(senderName, preview, avatarColor);
      this.showBrowserNotification(senderName, preview);
      console.log('🔔 Showing notification for message:', message);  // DEBUG: Log notification
    }

    this.cdr.detectChanges();
  }

  // ── Sidebar preview update ─────────────────────────────────────────────────

  private updateUserListPreview(conversationId: string, message: any): void {
    let user = this.findUserByConversationOrSender(conversationId, message.senderId?.toString());
    console.log('📝 Updating preview for user:', user, { conversationId, senderId: message.senderId });  // DEBUG: Log preview update

    if (!user) {
      this.loadConversations();
      return;
    }

    // Bind conversationId if not already set (first message in a new conversation)
    if (!user.conversationId) user.conversationId = conversationId;

    user.lastMessage =
      message.messageType === 'Text'  ? (message.content ?? '') :
      message.messageType === 'Image' ? '📷 Image' : `📎 ${message.attachments?.[0]?.fileName ?? 'File'}`;
    user.lastMessageTime = this.formatMessageTime(new Date(message.sentAt ?? Date.now()));
    user.lastMessageType = message.messageType;
    user.lastMessageAt   = new Date(message.sentAt ?? Date.now());

    this.sortUsersByLastMessage();
  }

  private findUserByConversationOrSender(conversationId: string, senderId?: string): any {
    const user = (
      this.users.find(u => u.conversationId?.toString() === conversationId) ||
      (senderId && this.users.find(u =>
        u.id?.toString()     === senderId ||
        u.userId?.toString() === senderId
      )) ||
      null
    );
    console.log('🔍 Finding user:', { conversationId, senderId, found: !!user, userId: user?.id });  // DEBUG: Log user lookup
    return user;
  }

  private incrementUnreadForConversation(conversationId: string): void {
    const user = this.users.find(u => u.conversationId?.toString() === conversationId);
    if (user) user.unreadCount = (user.unreadCount || 0) + 1;
    this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
    this.users = [...this.users];
    this.applySearch();
  }

  private sortUsersByLastMessage(): void {
    this.users.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
    this.users = [...this.users];
    this.applySearch();
  }

  private applySearch(): void {
    const q = this.searchQuery?.trim().toLowerCase() ?? '';
    this.filteredUsers = q
      ? this.users.filter(u => this.getUserDisplayName(u).toLowerCase().includes(q))
      : [...this.users];
  }

  // ═════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═════════════════════════════════════════════════════════════════════════

  showInAppToast(senderName: string, preview: string, avatarColor: string): void {
    console.log('🍞 Creating in-app toast:', { senderName, preview });  // DEBUG: Log toast creation
    const toast: InAppToast = {
      id:           ++this.toastCounter,
      senderName,
      preview,
      avatarColor,
      avatarLetter: senderName.charAt(0).toUpperCase()
    };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== toast.id);
      this.cdr.detectChanges();
    }, 4000);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  private requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  private showBrowserNotification(title: string, body: string): void {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    try {
      const n = new Notification(title, { body, icon: 'assets/login/ois-meet-logo.svg' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* ignore */ }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS & MESSAGES
  // ═════════════════════════════════════════════════════════════════════════

  loadConversations(): void {
    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success || !res.data) return;

          (res.data as any[]).forEach((conv: any) => {
            const other = conv.participants?.[0] || {};
            let user = this.users.find(u => u.id?.toString() === other.userId?.toString());

            if (user) {
              user.conversationId   = conv.id?.toString();
              user.lastMessage      = conv.lastMessage?.content || '';
              user.lastMessageTime  = conv.lastMessage?.sentAt
                ? this.formatMessageTime(new Date(conv.lastMessage.sentAt)) : '';
              user.lastMessageType  = conv.lastMessage?.messageType || '';
              user.lastMessageAt    = conv.lastMessage?.sentAt ? new Date(conv.lastMessage.sentAt) : null;
              user.unreadCount      = conv.unreadCount || 0;
            } else {
              this.users.push({
                id:              other.userId?.toString(),
                userId:          other.userId?.toString(),
                name:            other.name,
                fullName:        other.name,
                email:           other.email,
                isOnline:        other.isOnline || false,
                lastMessage:     conv.lastMessage?.content || '',
                lastMessageTime: conv.lastMessage?.sentAt
                  ? this.formatMessageTime(new Date(conv.lastMessage.sentAt)) : '',
                lastMessageType: conv.lastMessage?.messageType || '',
                lastMessageAt:   conv.lastMessage?.sentAt ? new Date(conv.lastMessage.sentAt) : null,
                unreadCount:     conv.unreadCount || 0,
                conversationId:  conv.id?.toString(),
                avatarColor:     this.commonService.getRandomColor()
              });
            }
          });

          // Join all conversation groups for real-time updates
          if (this.chatSignalrService.isConnected()) {
            (res.data as any[]).forEach((conv: any) => {
              this.chatSignalrService.joinConversation(conv.id?.toString());
            });
          }

          this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
          this.sortUsersByLastMessage();
        },
        error: (err) => console.error('Failed to load conversations', err)
      });
  }

  loadMessages(conversationId: string): void {
    if (!conversationId) return;
    this.isLoading = true;
    // Clear dedup set when loading a fresh conversation
    this.displayedMessageIds.clear();

    this.chatService.getMessages(conversationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const msgs: any[] = res.data;
            // Seed dedup set with already-loaded message ids
            msgs.forEach(m => { if (m.id) this.displayedMessageIds.add(m.id.toString()); });

            if (this.currentPage === 1) {
              this.messages  = msgs;
              this.shouldScroll = true;
            } else {
              this.messages = [...msgs, ...this.messages];
            }
            this.hasMoreMessages = msgs.length === 50;
            setTimeout(() => this.markVisibleMessagesAsRead(), 1000);
          }
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  async selectUser(user: any): Promise<void> {
    this.selectedUser = user;
    this.messages     = [];
    this.currentPage  = 1;
    this.hasMoreMessages = true;
    this.displayedMessageIds.clear();

    if (this.selectedConversation) {
      this.chatSignalrService.leaveConversation(this.selectedConversation.id);
    }

    // Reset unread count
    if (user.unreadCount > 0) {
      user.unreadCount = 0;
      this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
      this.users = [...this.users];
      this.applySearch();
    }

    if (user.conversationId) {
      this.selectedConversation = { id: user.conversationId };
      try {
        await this.chatSignalrService.joinConversation(user.conversationId);
        this.loadMessages(user.conversationId);
      } catch (err) { console.error('Failed to join conversation:', err); }
    } else {
      this.isLoading = true;
      this.chatService.createOrGetDirectConversation(user.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (res) => {
            if (res.success && res.data) {
              user.conversationId = res.data?.toString();
              this.selectedConversation = { id: user.conversationId };
              try {
                await this.chatSignalrService.joinConversation(user.conversationId);
                this.loadMessages(user.conversationId);
              } catch (err) { console.error('Failed to join conversation:', err); }
            }
            this.isLoading = false;
          },
          error: () => { this.isLoading = false; }
        });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Simplified send: NO optimistic message.
   *
   * Why no optimistic message?
   *   The ChatHub broadcasts to Clients.Group which INCLUDES the sender.
   *   So the sender will see their own message via the SignalR echo exactly
   *   like everyone else — with the real server ID, no clock icon, no duplication.
   *   We just need to make sure we don't suppress the sender's own echo, which
   *   the displayedMessageIds set handles correctly (it is populated only from
   *   loadMessages, not from locally created fakes).
   *
   * The input is briefly disabled (isSendingMessage = true) during the await
   * so the user gets feedback that the send is in progress.
   */
  async sendMessage(): Promise<void> {
    if (!this.newMessage.trim() || !this.selectedConversation || this.isSendingMessage) return;
    if (!this.currentUserId) return;

    const content = this.newMessage.trim();
    this.newMessage      = '';
    this.isSendingMessage = true;

    const request: SendMessageRequest = {
      conversationId: this.selectedConversation.id,
      messageType:    'Text',
      content,
      senderId:       this.currentUserId
    };

    try {
      await this.chatSignalrService.sendMessage(request);
      // Message will appear via the SignalR echo in handleNewMessage()
    } catch (err: any) {
      // Restore input on failure
      this.newMessage = content;
      console.error('Failed to send message:', err);

      const msg = err?.message || '';
      if (msg.includes('Conversation not found')) {
        alert('Conversation not found. Please select the user again.');
        this.selectedConversation = null;
      } else if (msg.includes('Connection is Disconnected')) {
        if (this.currentUserId) this.chatSignalrService.startConnection(this.currentUserId);
      } else {
        alert('Failed to send message. Please try again.');
      }
    } finally {
      this.isSendingMessage = false;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ═════════════════════════════════════════════════════════════════════════

  searchUsers(event: any): void {
    this.searchQuery = event.target.value.toLowerCase();
    this.applySearch();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCROLL / PAGINATION
  // ═════════════════════════════════════════════════════════════════════════

  onScroll(event: any): void {
    const el = event.target;
    if (el.scrollTop === 0 && this.hasMoreMessages && !this.isLoading) this.loadMoreMessages();
  }

  loadMoreMessages(): void {
    if (!this.hasMoreMessages || this.isLoading || !this.selectedConversation) return;
    this.currentPage++;
    this.loadMessages(this.selectedConversation.id);
  }

  private scrollToBottom(): void {
    try {
      if (this.chatMessagesContainer) {
        setTimeout(() => {
          const el = this.chatMessagesContainer.nativeElement;
          el.scrollTop = el.scrollHeight;
        }, 0);
      }
    } catch { /* ignore */ }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // READ RECEIPTS
  // ═════════════════════════════════════════════════════════════════════════

  private markMessageAsRead(messageId: string): void {
    if (!this.selectedConversation || !messageId) return;
    this.chatService.markMessagesAsRead(this.selectedConversation.id, [messageId]).subscribe();
    this.chatSignalrService.markMessagesAsRead(this.selectedConversation.id, [messageId]).catch(() => {});
  }

  private markVisibleMessagesAsRead(): void {
    if (!this.selectedConversation || !this.messages.length) return;
    const unread = this.messages
      .filter(m => m.senderId?.toString() !== this.currentUserId && !m.isRead)
      .map(m => m.id?.toString())
      .filter(Boolean);
    if (!unread.length) return;
    this.chatSignalrService.markMessagesAsRead(this.selectedConversation.id, unread).catch(() => {});
    unread.forEach(id => {
      const msg = this.messages.find(m => m.id?.toString() === id);
      if (msg) { msg.isRead = true; msg.isDelivered = true; }
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TYPING
  // ═════════════════════════════════════════════════════════════════════════

  onTyping(): void {
    if (!this.selectedConversation || !this.currentUserId) return;
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.chatSignalrService.sendTypingIndicator(this.selectedConversation.id, true);
    this.typingTimeout = setTimeout(() => {
      if (this.selectedConversation)
        this.chatSignalrService.sendTypingIndicator(this.selectedConversation.id, false);
      this.typingTimeout = null;
    }, 2000);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FILE HANDLING
  // ═════════════════════════════════════════════════════════════════════════

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) this.sendFile(file);
  }

  sendFile(file: File): void {
    if (!this.selectedConversation || !this.selectedUser) return;
    if (file.size > 10 * 1024 * 1024) { alert('File size exceeds 10MB limit'); return; }

    this.isSendingFile = true;
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const request: SendMessageRequest = {
        conversationId: this.selectedConversation!.id,
        messageType:    file.type.startsWith('image/') ? 'Image' : 'File',
        content:        '',
        senderId:       this.currentUserId,
        attachments:    [{ fileName: file.name, fileData: base64Data, fileSize: file.size, mimeType: file.type }]
      };
      this.chatSignalrService.sendMessage(request)
        .then(() => { this.isSendingFile = false; if (this.fileInput) this.fileInput.nativeElement.value = ''; })
        .catch(() => { this.isSendingFile = false; });
    };
    reader.readAsDataURL(file);
  }

  triggerFileInput(): void { this.fileInput.nativeElement.click(); }

  // ═════════════════════════════════════════════════════════════════════════
  // MISC HELPERS
  // ═════════════════════════════════════════════════════════════════════════

  selectConversation(conversation: any): void {
    if (this.selectedConversation) this.chatSignalrService.leaveConversation(this.selectedConversation.id);
    this.selectedConversation = conversation;
    if (this.chatSignalrService.isConnected()) this.chatSignalrService.joinConversation(conversation.id);
  }

  private updateMessageStatus(messageId: string, status: string): void {
    const msg = this.messages.find(m => m.id?.toString() === messageId?.toString());
    if (msg) {
      if (status === 'Read')      { msg.isRead = true; msg.isDelivered = true; }
      if (status === 'Delivered') { msg.isDelivered = true; }
    }
  }

  private updateUserOnlineStatus(userId: string, online: boolean): void {
    const user = this.users.find(u => u.userId?.toString() === userId?.toString());
    if (user) { user.isOnline = online; if (!online) user.lastSeen = new Date(); }
  }

  private deleteMessageFromUI(messageId: string): void {
    this.messages = this.messages.filter(m => m.id?.toString() !== messageId?.toString());
    this.displayedMessageIds.delete(messageId);
  }

  private addNewConversation(conversation: any): void {
    const otherUser = conversation.participants?.[0];
    if (otherUser && !this.users.find(u => u.userId?.toString() === otherUser.userId?.toString())) {
      this.users = [{
        ...otherUser,
        id:             otherUser.userId,
        conversationId: conversation.id,
        avatarColor:    this.commonService.getRandomColor()
      }, ...this.users];
      this.applySearch();
    }
  }

  downloadAttachment(attachment: any): void { if (attachment) window.open(attachment.fileUrl, '_blank'); }

  viewImage(message: any): void {
    this.selectedImage = {
      fileName: message.fileName || message.attachments?.[0]?.fileName,
      fileUrl:  message.fileUrl  || message.attachments?.[0]?.fileUrl
    };
    new bootstrap.Modal(document.getElementById('imageViewerModal')).show();
  }

  startVoiceCall(): void {}
  startVideoCall(): void {}
  showUserInfo():   void {}
  showEmojiPicker(): void {}
  loadUnreadCount(): void {}

  formatTime(date: Date): string {
    if (!date) return '';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private formatMessageTime(date: Date): string {
    const now = new Date();
    const d   = new Date(date);
    const dm  = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (dm < 1)    return 'Just now';
    if (dm < 60)   return `${dm}m ago`;
    if (dm < 1440) return `${Math.floor(dm / 60)}h ago`;
    if (dm < 2880) return 'Yesterday';
    return d.toLocaleDateString();
  }

  getFileSize(bytes: number | undefined | null): string {
    if (!bytes) return '0 Bytes';
    const k = 1024, s = ['Bytes','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
  }

  private handleShareMeetingId(meetingId: string, text: string): void {
    if (!this.selectedConversation || !this.currentUserId) {
      console.log('[Chat] No conversation open; meeting ID is on clipboard:', meetingId);
      return;
    }
    // const request: SendMessageRequest = {
    //   conversationId: this.selectedConversation.id,
    //   messageType: 'Text',
    //   content: text || `Join my meeting! Meeting ID: ${meetingId}`,
    //   senderId: this.currentUserId
    // };
    // this.chatSignalrService.sendMessage(request)
    //   .then(() => console.log('[Chat] Meeting ID shared in chat.'))
    //   .catch((err: any) => console.error('[Chat] Failed to share meeting ID:', err));
  }
}
