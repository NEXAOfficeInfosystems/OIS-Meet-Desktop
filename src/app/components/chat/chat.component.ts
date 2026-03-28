import {
  Component, OnInit, ViewChild, ElementRef,
  AfterViewChecked, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import * as signalR from '@microsoft/signalr';

import { SessionService }   from '../../core/services/session.service';
import { CommonService }    from '../../core/services/common.service';
import { UserService }      from '../../core/services/user.service';
import { StorageService }   from '../../core/services/storage.service';
import { ChatService }      from '../../core/services/chat.service';
import { MeetingService }   from '../../core/services/meeting.service';           // ← ADDED
import { ChatSignalrService, SendMessageRequest } from '../../core/services/chat-signalr.service';
import { MeetingLinkPipe }  from '../../shared/pipes/meeting-link.pipe';

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
  imports:     [CommonModule, FormsModule, HttpClientModule, MeetingLinkPipe],
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
  isSendingMessage: boolean = false;
  currentPage:      number  = 1;
  hasMoreMessages:  boolean = true;
  isTyping:         boolean = false;
  totalUnreadCount: number  = 0;
  searchQuery:      string  = '';
  isConnected:      boolean = false;

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
  private isSwitchingUser   = false; 
  private conversationSwitch$ = new Subject<void>();
  private companySubscription!:         Subscription;
  private syncSubscription!:            Subscription;
  private connectionStateSubscription!: Subscription;
  private shareMeetingIdHandler: ((e: Event) => void) | null = null;

  // ── Deduplication ─────────────────────────────────────────────────────────
  private displayedMessageIds = new Set<string>();

  constructor(
    private sessionService:     SessionService,
    private commonService:      CommonService,
    private userService:        UserService,
    private storageService:     StorageService,
    private chatService:        ChatService,
    private meetingService:     MeetingService,     // ← ADDED for validateMeeting
    private chatSignalrService: ChatSignalrService,
    private cdr:                ChangeDetectorRef,
    private router:             Router,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.currentUserId = this.sessionService.getOISMeetUserId() || null;

    if (this.currentUserId) {
      this.chatSignalrService.startConnection(this.currentUserId);
    }

    this.setupSignalREvents();

    // ── FIX: loadConversations only after SignalR connects ────────────────
    // Remove the direct loadConversations() call from here — it now only
    // fires from connectionState$ AFTER users are loaded
    this.connectionStateSubscription = this.chatSignalrService.connectionState$
      .subscribe(state => {
        this.isConnected = state === signalR.HubConnectionState.Connected;
        if (state === signalR.HubConnectionState.Connected) {
          // Only load conversations here — users already loaded by this point
          this.loadConversations();
        }
      });

    const pendingCompanyId = sessionStorage.getItem('selectedCompanyId');
    if (pendingCompanyId) {
      this.isCompanyChanging = true;
      this.isLoading = true;
    } else {
      // ── FIX: load users FIRST, then conversations inside the callback ──
      this.loadUsersForCurrentCompany();
    }

    this.companySubscription = this.commonService.companyChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.handleCompanyChange());

    this.syncSubscription = this.commonService.syncComplete$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.handleSyncComplete());

    this.shareMeetingIdHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.meetingId) this.handleShareMeetingId(detail.meetingId, detail.text);
    };
    window.addEventListener('ois-share-meeting-id', this.shareMeetingIdHandler);

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
    this.conversationSwitch$.complete();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // COMPANY CHANGE
  // ═════════════════════════════════════════════════════════════════════════

  private handleCompanyChange(): void {
    this.users         = [];
    this.filteredUsers = [];
    this.selectedUser  = null;
    this.messages      = [];
    this.isLoading     = true;
    this.isCompanyChanging = true;
    this.displayedMessageIds.clear();
  }

  private handleSyncComplete(): void {
    this.isCompanyChanging = false;
    sessionStorage.removeItem('selectedCompanyId');
    this.loadUsersForCurrentCompany();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // USER LOADING
  // ═════════════════════════════════════════════════════════════════════════

  private loadUsersForCurrentCompany(): void {
    if (this.isCompanyChanging) return;

    this.isLoading = true;
    const clientId = this.sessionService.getClientId() ?? '';
    const companyId = this.sessionService.getCompanyId() ?? 0;
    const appId = this.sessionService.getMeetAppId() ?? '';

    this.userService.getOisMeetUsers(clientId, companyId, appId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const loggedInSSOUserId = this.sessionService.getUserId() || '';
            const currentUser = res.data.find(
              (u: any) => u.ssoUserId === loggedInSSOUserId
            );

            if (currentUser) {
              this.storageService.setItem('oisMeetUserId', currentUser.id);
              this.currentUserId = currentUser.id;
            }

            const transformed = this.transformSSOUsersToChatUsers(res.data)
              .filter((u: any) => u.id !== this.currentUserId);

            // ── Merge to preserve any unread already set ─────────────────
            transformed.forEach(newUser => {
              const existing = this.users.find(
                u => u.id?.toString() === newUser.id?.toString()
              );
              if (existing) {
                newUser.unreadCount = existing.unreadCount || 0;
                newUser.conversationId = existing.conversationId || null;
                newUser.lastMessage = existing.lastMessage || '';
                newUser.lastMessageTime = existing.lastMessageTime || '';
                newUser.lastMessageType = existing.lastMessageType || '';
                newUser.lastMessageAt = existing.lastMessageAt || null;
              }
            });

            this.users = transformed;
            this.filteredUsers = [...this.users];
          }
          this.isLoading = false;

          // ── FIX: if SignalR already connected before users finished
          //    loading, loadConversations was skipped — call it now ───────
          if (this.chatSignalrService.isConnected()) {
            this.loadConversations();
          }
          // If NOT yet connected, connectionState$ will fire loadConversations
          // once SignalR connects — which will always be AFTER this completes
        },
        error: () => {
          this.isLoading = false;
          setTimeout(() => {
            if (!this.isCompanyChanging) this.loadUsersForCurrentCompany();
          }, 2000);
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
    if (!message?.conversationId) return;

    const conversationId = message.conversationId?.toString() ?? '';
    const msgId = message.id?.toString() ?? '';
    const isFromMe = message.senderId?.toString() === this.currentUserId?.toString();
    const isActiveConversation = this.selectedConversation?.id?.toString() === conversationId;
    const isAppBackgrounded = this.isAppBackgrounded();
    const shouldNotifyReceiver = !isFromMe && (!isActiveConversation || isAppBackgrounded);

    if (msgId && this.displayedMessageIds.has(msgId)) return;
    if (msgId) this.displayedMessageIds.add(msgId);

    if (isActiveConversation) {
      const updated = [...this.messages, message];
      this.messages = this.decorateMessagesWithDates(updated);
      this.shouldScroll = true;

      // ── FIX: Mark as read immediately if conversation is open ──────────
      if (!isFromMe && !isAppBackgrounded) {
        setTimeout(() => this.markAllUnreadAsRead(conversationId), 300);
      }
    }

    this.updateUserListPreview(conversationId, message);

    if (shouldNotifyReceiver) {
      this.incrementUnreadForConversation(conversationId);
      const sender = this.findUserByConversationOrSender(conversationId, message.senderId?.toString());
      const senderName = sender ? this.getUserDisplayName(sender) : 'New message';
      const avatarColor = sender?.avatarColor ?? '#1a73e8';
      const preview =
        message.messageType === 'Text' ? (message.content ?? '').substring(0, 60) :
          message.messageType === 'Image' ? '📷 Image' : '📎 File';

      this.showInAppToast(senderName, preview, avatarColor);
      this.showBrowserNotification(senderName, preview);
    }

    this.cdr.detectChanges();
  }

  private isAppBackgrounded(): boolean {
    const isHidden = document.visibilityState !== 'visible';
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    return isHidden || !hasFocus;
  }

  private updateUserListPreview(conversationId: string, message: any): void {
    let user = this.findUserByConversationOrSender(conversationId, message.senderId?.toString());
    if (!user) { this.loadConversations(); return; }
    if (!user.conversationId) {
      user.conversationId = conversationId.toString();
    }

    user.lastMessage =
      message.messageType === 'Text'  ? (message.content ?? '') :
      message.messageType === 'Image' ? '📷 Image' : `📎 ${message.attachments?.[0]?.fileName ?? 'File'}`;
    const parsedSent = this.parseDate(message.sentAt ?? Date.now()) ?? new Date();
    user.lastMessageTime = this.formatMessageTime(parsedSent);
    user.lastMessageType = message.messageType;
    user.lastMessageAt   = parsedSent;

    this.sortUsersByLastMessage();
  }

  private findUserByConversationOrSender(conversationId: string, senderId?: string): any {
    const convId = conversationId?.toString();
    const sender = senderId?.toString();

    return (
      this.users.find(u => u.conversationId?.toString() === convId) ||
      (sender && this.users.find(u =>
        u.id?.toString()     === sender ||
        u.userId?.toString() === sender
      )) ||
      null
    );
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
    const q = this.searchQuery?.trim().toLowerCase() ?? '';
    this.filteredUsers = q
      ? this.users.filter(u => this.getUserDisplayName(u).toLowerCase().includes(q))
      : [...this.users];
    this.cdr.detectChanges();
  }

  private applySearch(): void {
     this.sortUsersByLastMessage();
    // const q = this.searchQuery?.trim().toLowerCase() ?? '';
    // this.filteredUsers = q
    //   ? this.users.filter(u => this.getUserDisplayName(u).toLowerCase().includes(q))
    //   : [...this.users];
  }

  // ═════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═════════════════════════════════════════════════════════════════════════

  showInAppToast(senderName: string, preview: string, avatarColor: string): void {
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
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.showNotification === 'function') {
      electronApi.showNotification({ title, body }).catch(() => {});
      return;
    }

    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
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
            let user = this.users.find(
              u => u.id?.toString() === other.userId?.toString()
            );

            if (user) {
              user.conversationId = conv.id?.toString();
              user.lastMessage = conv.lastMessage?.content || '';
              user.lastMessageTime = conv.lastMessage?.sentAt
                ? this.formatMessageTime(this.parseDate(conv.lastMessage.sentAt)) : '';
              user.lastMessageType = conv.lastMessage?.messageType || '';
              user.lastMessageAt = conv.lastMessage?.sentAt
                ? this.parseDate(conv.lastMessage.sentAt) : null;
              user.unreadCount = conv.unreadCount || 0;   // ← from API
            } else {
              this.users.push({
                id: other.userId?.toString(),
                userId: other.userId?.toString(),
                name: other.name,
                fullName: other.name,
                email: other.email,
                isOnline: other.isOnline || false,
                lastMessage: conv.lastMessage?.content || '',
                lastMessageTime: conv.lastMessage?.sentAt
                  ? this.formatMessageTime(this.parseDate(conv.lastMessage.sentAt)) : '',
                lastMessageType: conv.lastMessage?.messageType || '',
                lastMessageAt: conv.lastMessage?.sentAt
                  ? this.parseDate(conv.lastMessage.sentAt) : null,
                unreadCount: conv.unreadCount || 0,
                conversationId: conv.id?.toString(),
                avatarColor: this.commonService.getRandomColor()
              });
            }
          });

          if (this.chatSignalrService.isConnected()) {
            (res.data as any[]).forEach((conv: any) => {
              this.chatSignalrService.joinConversation(conv.id?.toString());
            });
          }

          // ── FIX: force new array reference so Angular re-evaluates
          //    unreadCount > 0 for bold and badge in the template ─────────
          this.totalUnreadCount = this.users.reduce(
            (s, u) => s + (u.unreadCount || 0), 0
          );
          this.users = [...this.users];        // ← THIS is why badge was not showing
          this.sortUsersByLastMessage();
        },
        error: (err) => console.error('Failed to load conversations', err)
      });
  }

  loadMessages(conversationId: string): void {
    if (!conversationId) return;
    this.isLoading = true;
    this.displayedMessageIds.clear();

    this.chatService.getMessages(conversationId, this.currentPage)
      .pipe(
        takeUntil(this.destroy$),
        takeUntil(this.conversationSwitch$)
      )
      .subscribe({
        next: (res) => {
          if (this.selectedConversation?.id?.toString() !== conversationId?.toString()) {
            this.isSwitchingUser = false;
            return;
          }

          if (res.success && res.data) {
            const msgs: any[] = res.data;
            msgs.forEach(m => { if (m.id) this.displayedMessageIds.add(m.id.toString()); });

            if (this.currentPage === 1) {
              this.messages = this.decorateMessagesWithDates(msgs);
              this.shouldScroll = true;
            } else {
              const combined = [...msgs, ...this.messages];
              this.messages = this.decorateMessagesWithDates(combined);
            }

            this.hasMoreMessages = msgs.length === 50;

            // ── FIX: Mark ALL unread messages as read immediately ────────
            // No scrolling required — opening the conversation = read
            this.markAllUnreadAsRead(conversationId);
          }

          this.isLoading = false;
          this.isSwitchingUser = false;
        },
        error: () => {
          this.isLoading = false;
          this.isSwitchingUser = false;
        }
      });
  }

  private markAllUnreadAsRead(conversationId: string): void {
    if (!conversationId || !this.currentUserId) return;

    const unreadIds = this.messages
      .filter(m =>
        m.senderId?.toString() !== this.currentUserId &&
        !m.isRead
      )
      .map(m => m.id?.toString())
      .filter(Boolean) as string[];

    if (!unreadIds.length) return;

    // Update UI immediately
    this.messages = this.messages.map(m => {
      if (unreadIds.includes(m.id?.toString())) {
        return { ...m, isRead: true, isDelivered: true };
      }
      return m;
    });

    // ── Use MarkAllMessagesAsRead — covers ALL pages, not just loaded ones
    this.chatSignalrService
      .markAllMessagesAsRead(conversationId)
      .catch(err => console.error('markAllMessagesAsRead failed:', err));

    this.cdr.detectChanges();
  }
  async selectUser(user: any): Promise<void> {
    this.isSwitchingUser = true;
    this.conversationSwitch$.next();

    this.selectedUser = user;
    this.messages = [];
    this.currentPage = 1;
    this.hasMoreMessages = true;
    this.isLoading = false;

    // ── FIX: Clear unread badge immediately when user opens conversation ──
    if (user.unreadCount > 0) {
      user.unreadCount = 0;
      this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
      this.users = [...this.users];
      this.sortUsersByLastMessage();
    }

    if (user.conversationId) {
      this.selectedConversation = { id: user.conversationId };
      try {
        await this.chatSignalrService.joinConversation(user.conversationId);
        this.loadMessages(user.conversationId);
      } catch (err) {
        console.error('Failed to join conversation:', err);
        this.isSwitchingUser = false;
      }
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
              } catch (err) {
                console.error('Failed to join conversation:', err);
                this.isSwitchingUser = false;
              }
            }
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
            this.isSwitchingUser = false;
          }
        });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ═════════════════════════════════════════════════════════════════════════

  async sendMessage(): Promise<void> {
    if (!this.newMessage.trim() || !this.selectedConversation || this.isSendingMessage) return;
    if (!this.currentUserId) return;

    const content         = this.newMessage.trim();
    this.newMessage       = '';
    this.isSendingMessage = true;

    const request: SendMessageRequest = {
      conversationId: this.selectedConversation.id,
      messageType:    'Text',
      content,
      senderId:       this.currentUserId
    };

    try {
      await this.chatSignalrService.sendMessage(request);
    } catch (err: any) {
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
  // MEETING LINK CLICK — FIX: validate then join as participant
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Event-delegation handler on each text-message bubble.
   * Fires only when the user clicks a .meeting-id-link chip.
   *
   * FIX: calls validateMeeting API before opening the window so the
   * participant is properly registered.  Shows a spinner-style snack
   * while validating to give visual feedback.
   */
  onMessageClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Walk up one level in case user clicked the <small> ▶ Join child
    const chip = target.classList.contains('meeting-id-link')
      ? target
      : (target.parentElement?.classList.contains('meeting-id-link')
          ? target.parentElement
          : null);

    if (!chip) return;

    const meetingId = chip.getAttribute('data-meeting-id');
    if (!meetingId) return;

    const confirmed = confirm(
      `Join meeting?\n\nMeeting ID: ${meetingId}\n\nClick OK to join.`
    );
    if (!confirmed) return;

    // Validate the meeting via API then open the window as participant
    this.validateAndJoinMeeting(meetingId);
  }

  /**
   * FIX for Issue 2:
   * Validates the meeting ID via API (same as the dialog does for join-meeting),
   * calls joinMeeting so the participant is registered server-side,
   * then opens the meeting window.
   */
  private validateAndJoinMeeting(meetingId: string): void {
    const userId   = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      alert('User not authenticated. Please log in again.');
      return;
    }

    // Validate first
    this.meetingService.validateMeeting(meetingId).subscribe({
      next: (validateRes: any) => {
        if (!validateRes.success) {
          alert(validateRes.message || 'Invalid or expired meeting ID.');
          return;
        }

        // Register participant server-side
        this.meetingService.joinMeeting({ meetingId, userId, userName }).subscribe({
          next: (joinRes: any) => {
            if (joinRes.success) {
              this.openMeetingWindow(meetingId, false);
            } else {
              alert('Could not join meeting. Please try again.');
            }
          },
          error: () => alert('Failed to join meeting. Please try again.')
        });
      },
      error: () => alert('Could not validate meeting. Please try again.')
    });
  }

  /**
   * Opens the meeting room in a new Electron BrowserWindow (or browser tab).
   * Used by both the chat click handler and meet-now-dialog (via selectUser flow).
   *
   * FIX: In the installed EXE, window.location.origin is "null" (file:// context),
   * so we send { routePath, queryString } and let main.js resolve it with loadFile().
   */
  openMeetingWindow(
    meetingId: string,
    isHost:    boolean,
    mic        = false,
    cam        = false
  ): void {
    const params = new URLSearchParams({
      host:  String(isHost),
      topic: 'OIS Meet',
      mic:   String(mic),
      cam:   String(cam),
    });

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.openMeetingWindow === 'function') {
      // Send structured payload so main.js can use loadFile() in production
      electronApi.openMeetingWindow({
        routePath:   `/meeting/${meetingId}`,
        queryString: params.toString(),
      });
    } else {
      // Browser / dev-server fallback — window.location.origin is valid here
      const url = `${window.location.origin}/meeting/${meetingId}?${params}`;
      window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no');
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SHARE MEETING ID — FIX: auto-select first user if none selected
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * FIX for Issue 1:
   * Called when the meet-now-dialog fires the 'ois-share-meeting-id' event.
   *
   * Priority:
   *   1. Use the currently selected conversation (user already open in chat).
   *   2. If no conversation is open, auto-select the FIRST user in the list,
   *      create/get their conversation, then send the message.
   */
  private handleShareMeetingId(meetingId: string, text: string): void {
    const messageText = text || `Join my meeting! Meeting ID: ${meetingId}`;

    // Case 1 — a conversation is already open, send immediately
    if (this.selectedConversation && this.currentUserId) {
      this.sendMeetingIdMessage(messageText);
      return;
    }

    // Case 2 — no conversation open, auto-select first user and send
    const firstUser = this.users[0];
    if (!firstUser) {
      console.warn('[Chat] No users available to share meeting ID with.');
      return;
    }

    console.log('[Chat] No conversation selected; auto-selecting first user:', this.getUserDisplayName(firstUser));

    // Select the first user (opens their conversation) then send
    this.selectUser(firstUser).then(() => {
      // Give the conversation a moment to initialise before sending
      setTimeout(() => {
        if (this.selectedConversation && this.currentUserId) {
          this.sendMeetingIdMessage(messageText);
        }
      }, 500);
    });
  }

  /**
   * Sends the meeting-ID text message into the currently selected conversation.
   */
  private sendMeetingIdMessage(text: string): void {
    if (!this.selectedConversation || !this.currentUserId) return;

    const request: SendMessageRequest = {
      conversationId: this.selectedConversation.id,
      messageType:    'Text',
      content:        text,
      senderId:       this.currentUserId
    };

    this.chatSignalrService.sendMessage(request)
      .then(() => console.log('[Chat] Meeting ID shared in chat.'))
      .catch((err: any) => console.error('[Chat] Failed to share meeting ID:', err));
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
    if (this.isSwitchingUser) return;

    const el = event.target;
    if (el.scrollTop === 0 && this.hasMoreMessages && !this.isLoading) {
      this.loadMoreMessages();
    }
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

  startVoiceCall():  void {}
  startVideoCall():  void {}
  showUserInfo():    void {}
  showEmojiPicker(): void {}
  loadUnreadCount(): void {}

  // formatTime(date: any): string {
  //   if (!date) return '';
  //   const normalized = typeof date === 'string'
  //     ? date.replace(/(\.\d{3})\d+/, '$1')
  //     : date;
  //   const d = new Date(normalized);
  //   if (isNaN(d.getTime())) return '';
  //   return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // }

  formatTime(value: any): string {
    if (!value) return '';
    const d = this.parseDate(value);
    if (!d) return '';
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private formatMessageTime(date: Date | string | any): string {
    const now = new Date();
    const d = date instanceof Date ? date : this.parseDate(date as any);
    if (!d) return '';
    const dm = Math.floor((now.getTime() - d.getTime()) / 60000);
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

  private parseDate(value: any): Date | null {
    if (!value) return null;
    let normalized: any = value;
    if (typeof value === 'string') {
      normalized = value.replace(/(\.\d{3})\d+/, '$1');
      if (!/[Zz]|[+\-]\d{2}:?\d{2}$/.test(normalized)) {
        normalized = normalized + 'Z';
      }
    }
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }

  private getDateLabel(sentAt: any): string {
    const d = this.parseDate(sentAt);
    if (!d) return '';
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
    };
    return d.toLocaleDateString(undefined, opts);
  }

  private decorateMessagesWithDates(msgs: any[]): any[] {
    return msgs.map((msg, index) => {
      const current = this.parseDate(msg.sentAt);
      const previous = index > 0 ? this.parseDate(msgs[index - 1].sentAt) : null;
      const show = index === 0 ||
        (!!current && !!previous && current.toDateString() !== previous.toDateString());
      return {
        ...msg,
        showDateSeparator: show,
        dateSeparatorLabel: show ? this.getDateLabel(msg.sentAt) : ''
      };
    });
  }
}
