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
import { FileService }      from '../../core/services/file.service';
import { MeetingService }   from '../../core/services/meeting.service';
import { PresenceService }  from '../../core/services/presence.service';
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

  // â”€â”€ User / conversation state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  users:                any[] = [];
  filteredUsers:        any[] = [];
  selectedUser:         any   = null;
  selectedConversation: any   = null;
  currentUserId:        string | null = null;

  // â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  messages:    any[]  = [];
  newMessage:  string = '';

  // â”€â”€ UI flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  isLoading:        boolean = false;
  isSendingFile:    boolean = false;
  isSendingMessage: boolean = false;
  currentPage:      number  = 1;
  hasMoreMessages:  boolean = true;
  isTyping:         boolean = false;
  totalUnreadCount: number  = 0;
  searchQuery:      string  = '';
  isConnected:      boolean = false;
  isUploading:      boolean = false;

  // â”€â”€ Teams Workspace State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  activeView: 'chat' | 'teams' = 'teams'; 
  activeTeam: string = '';
  activeChannel: string = 'General';

  // These will now be populated from the API
  teams: any[] = [];
  channels: string[] = ['General']; // Default fallback channel for groups

  sharedFiles = [
    { name: 'OIS Marketing Campaign.pptx', size: '4.2 MB', type: 'ppt', date: 'Oct 24, 2026', owner: 'Ramya' },
    { name: 'Campaign Budget.xlsx', size: '1.8 MB', type: 'xls', date: 'Oct 22, 2026', owner: 'Senthil' },
    { name: 'Branding Guidelines.pdf', size: '12.5 MB', type: 'pdf', date: 'Oct 15, 2026', owner: 'Admin' }
  ];

  activityFeed = [
    { user: 'Senthil Kumar', action: 'added you to Marketing Team', time: '2h ago' },
    { user: 'Ramya', action: 'uploaded Branding Guidelines.pdf', time: '5h ago' },
    { user: 'Rohan Patel', action: 'reacted to your message', time: '1d ago' }
  ];

  // â”€â”€ In-app toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  toasts:              InAppToast[] = [];
  private toastCounter = 0;

  // â”€â”€ Image viewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  selectedImage: any = null;

  // â”€â”€ Private state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Deduplication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private displayedMessageIds = new Set<string>();

  constructor(
    private sessionService:     SessionService,
    private commonService:      CommonService,
    private userService:        UserService,
    private storageService:     StorageService,
    private chatService:        ChatService,
    private fileService:        FileService,
    private meetingService:     MeetingService,     // â† ADDED for validateMeeting
    private chatSignalrService: ChatSignalrService,
    private presenceService:    PresenceService,
    private cdr:                ChangeDetectorRef,
    private router:             Router,
  ) {
    this.currentUserId = this.sessionService.getOISMeetUserId();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LIFECYCLE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  ngOnInit(): void {
    this.currentUserId = this.sessionService.getOISMeetUserId() || null;

    if (this.currentUserId) {
      this.chatSignalrService.startConnection(this.currentUserId);
    }

    this.setupSignalREvents();
    this.setupPresenceTracking();

    // â”€â”€ FIX: loadConversations only after SignalR connects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Remove the direct loadConversations() call from here â€” it now only
    // fires from connectionState$ AFTER users are loaded
    this.connectionStateSubscription = this.chatSignalrService.connectionState$
      .subscribe(state => {
        this.isConnected = state === signalR.HubConnectionState.Connected;
        if (state === signalR.HubConnectionState.Connected) {
          // Only load conversations here â€” users already loaded by this point
          this.loadConversations();
          
          // â”€â”€ ADDED: Auto-select channel if in Teams view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          setTimeout(() => {
            if (this.activeView === 'teams') {
              this.selectChannel('General');
            }
          }, 1000); // Give a moment for conversations to load
        }
      });

    const pendingCompanyId = sessionStorage.getItem('selectedCompanyId');
    if (pendingCompanyId) {
      this.isCompanyChanging = true;
      this.isLoading = true;
    } else {
      // â”€â”€ FIX: load users FIRST, then conversations inside the callback â”€â”€
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

  sendMessage(fileUrl?: string, fileName?: string): void {
    const content = this.newMessage?.trim();
    if (!content && !fileUrl) return;

    this.isSendingMessage = true;
    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    const msgType = fileUrl ? 'File' : 'Text';

    this.chatService.sendMessageApi(conversationId, content || '', msgType, fileUrl, fileName)
      .subscribe({
        next: (res) => {
          if (res.success) {
            if (!fileUrl) this.newMessage = '';
          }
          this.isSendingMessage = false;
        },
        error: (err) => {
          console.error('API Send failed', err);
          this.isSendingMessage = false;
        }
      });
  }

  // â”€â”€ FILE UPLOAD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      this.uploadFile(file);
    }
  }

  private uploadFile(file: File): void {
    this.isUploading = true;
    this.fileService.uploadFile(file).subscribe({
      next: (event: any) => {
        if (event.type === 4) { // Sent
          const res = event.body;
          if (res.success && res.data) {
            this.sendMessage(res.data.url, res.data.fileName);
          }
          this.isUploading = false;
        }
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.isUploading = false;
      }
    });
  }

  public downloadFile(fileUrl: string, fileName: string): void {
    const fullUrl = this.fileService.getFileUrl(fileUrl);
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // COMPANY CHANGE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // USER LOADING
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  private loadUsersForCurrentCompany(): void {
    if (this.isCompanyChanging) return;

    this.isLoading = true;
    const clientId = this.sessionService.getClientId() ?? '';
    const companyIdRaw = this.sessionService.getCompanyId() ?? 0;
    const companyId = Number(companyIdRaw);

    this.chatService.getUsers(clientId, companyId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const transformed = res.data.map((u: any) => ({
              id:              u.id?.toString(),
              userId:          u.ssoUserId || u.id?.toString(),
              name:            u.fullName || u.name || u.userName || 'Unknown',
              fullName:        u.fullName || u.name || u.userName || 'Unknown',
              email:           u.email || '',
              isOnline:        u.isOnline || false,
              lastMessage:     '',
              lastMessageTime: '',
              lastMessageType: '',
              lastMessageAt:   null as Date | null,
              unreadCount:     0,
              avatarColor:     this.commonService.getRandomColor(),
              status:          'Available',
              isGroup:         false,
              isSelf:          u.id?.toString() === this.currentUserId?.toString()
            })).map((u: any) => {
              if (u.isSelf) {
                u.name = u.name + ' (You)';
                u.fullName = u.fullName + ' (You)';
              }
              return u;
            });

            // Filter out self
            const filteredTransformed = transformed.filter((u: any) => u.id !== this.currentUserId);

            // Merge with existing state to preserve conversationId / lastMessage
            filteredTransformed.forEach((newUser: any) => {
              const existing = this.users.find(u => u.id === newUser.id);
              if (existing) {
                newUser.conversationId = existing.conversationId;
                newUser.lastMessage = existing.lastMessage;
                newUser.lastMessageTime = existing.lastMessageTime;
                newUser.lastMessageAt = existing.lastMessageAt;
                newUser.unreadCount = existing.unreadCount;
                newUser.isGroup = existing.isGroup;
              }
            });
            this.users = filteredTransformed;
            this.updateTeamsList();
            this.applySearch();

            if (this.currentUserId && !this.chatSignalrService.isConnected()) {
              this.chatSignalrService.startConnection(this.currentUserId);
            } else if (this.chatSignalrService.isConnected()) {
              this.loadConversations();
            }
          }
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          setTimeout(() => {
            if (!this.isCompanyChanging) this.loadUsersForCurrentCompany();
          }, 2000);
        }
      });
  }

  getUserDisplayName(user: any): string {
    return user?.fullName || user?.name || 'Unknown';
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SIGNALR EVENT SUBSCRIPTIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    this.chatSignalrService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msgId => { if (msgId) this.deleteMessageFromUI(msgId); });

    this.chatSignalrService.newConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conv => { if (conv) this.addNewConversation(conv); });
  }

  private setupPresenceTracking(): void {
    this.presenceService.onlineUsers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(onlineIds => {
        this.users.forEach(u => {
          u.isOnline = onlineIds.map(id => id.toString()).includes(u.id?.toString());
        });
        this.cdr.detectChanges();
      });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // INCOMING MESSAGE HANDLER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
      this.updateSharedFiles();

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
          message.messageType === 'Image' ? 'ðŸ“· Image' : 'ðŸ“Ž File';

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
      message.messageType === 'Image' ? 'ðŸ“· Image' : `ðŸ“Ž ${message.attachments?.[0]?.fileName ?? 'File'}`;
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
    this.users = [...this.users];
    this.updateTeamsList();
    this.cdr.detectChanges();
  }

  private updateTeamsList(): void {
    // Derived Teams are all Group conversations in our users list
    const groupUsers = this.users.filter(u => u.isGroup);
    
    this.teams = groupUsers.map(u => ({
      id: u.id,
      name: u.name,
      color: u.avatarColor || '#10b981',
      icon: 'bi bi-hash',
      conversationId: u.conversationId
    }));

    if (this.teams.length > 0 && !this.activeTeam) {
      this.activeTeam = this.teams[0].name;
    }
  }

  private applySearch(): void {
     this.sortUsersByLastMessage();
    // this.filteredUsers = q
    //   ? this.users.filter(u => this.getUserDisplayName(u).toLowerCase().includes(q))
    //   : [...this.users];
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTIFICATIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CONVERSATIONS & MESSAGES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  loadConversations(): void {
    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success || !res.data) return;

          (res.data as any[]).forEach((conv: any) => {
            const isGroup = conv.conversationType === 'Group';
            const other = conv.participants?.[0] || {};
            
            // For groups, uniquely identify by conversationId. For direct, by other user's id.
            let user = isGroup 
              ? this.users.find(u => u.conversationId === conv.id?.toString())
              : this.users.find(u => u.id?.toString() === other.userId?.toString());

            if (user) {
              user.conversationId = conv.id?.toString();
              user.isGroup = isGroup;
              user.lastMessage = conv.lastMessage?.content || '';
              user.lastMessageTime = conv.lastMessage?.sentAt
                ? this.formatMessageTime(this.parseDate(conv.lastMessage.sentAt)) : '';
              user.lastMessageType = conv.lastMessage?.messageType || '';
              user.lastMessageAt = conv.lastMessage?.sentAt
                ? this.parseDate(conv.lastMessage.sentAt) : null;
              user.unreadCount = conv.unreadCount || 0;
            } else {
              this.users.push({
                id: isGroup ? conv.id?.toString() : other.userId?.toString(),
                userId: isGroup ? null : other.userId?.toString(),
                name: isGroup ? (conv.name || 'Marketing Team') : other.name,
                fullName: isGroup ? (conv.name || 'Marketing Team') : other.name,
                email: other.email || '',
                isOnline: isGroup ? true : (other.isOnline || false),
                lastMessage: conv.lastMessage?.content || '',
                lastMessageTime: conv.lastMessage?.sentAt
                  ? this.formatMessageTime(this.parseDate(conv.lastMessage.sentAt)) : '',
                lastMessageType: conv.lastMessage?.messageType || '',
                lastMessageAt: conv.lastMessage?.sentAt
                  ? this.parseDate(conv.lastMessage.sentAt) : null,
                unreadCount: conv.unreadCount || 0,
                conversationId: conv.id?.toString(),
                avatarColor: this.commonService.getRandomColor(),
                isGroup: isGroup
              });
            }
          });

          this.updateTeamsList();

          if (this.chatSignalrService.isConnected()) {
            (res.data as any[]).forEach((conv: any) => {
              this.chatSignalrService.joinConversation(conv.id?.toString());
            });
          }

          // â”€â”€ FIX: force new array reference so Angular re-evaluates
          //    unreadCount > 0 for bold and badge in the template â”€â”€â”€â”€â”€â”€â”€â”€â”€
          this.totalUnreadCount = this.users.reduce(
            (s, u) => s + (u.unreadCount || 0), 0
          );
          this.users = [...this.users];
          this.updateTeamsList();
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
              this.updateSharedFiles();
              this.shouldScroll = true;
            } else {
              const combined = [...msgs, ...this.messages];
              this.messages = this.decorateMessagesWithDates(combined);
            }

            this.hasMoreMessages = msgs.length === 50;

            // â”€â”€ FIX: Mark ALL unread messages as read immediately â”€â”€â”€â”€â”€â”€â”€â”€
            // No scrolling required â€” opening the conversation = read
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

    // â”€â”€ Use MarkAllMessagesAsRead â€” covers ALL pages, not just loaded ones
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

    // â”€â”€ FIX: Clear unread badge immediately when user opens conversation â”€â”€
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

  // â”€â”€ TEAMS & CHANNELS LOGIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  selectTeam(team: any): void {
    this.activeTeam = team.name;
    // For now, default to the 'General' channel of the selected team
    this.selectChannel('General');
  }

  selectChannel(channel: string): void {
    this.activeChannel = channel;
    this.messages = [];
    this.currentPage = 1;
    this.hasMoreMessages = true;

    // Find the 'Group' conversation that represents this channel
    // In a real app, channels would have their own IDs. 
    // Here we'll search conversations where type is 'Group' 
    // or just use a fallback if not found.
    const groupConv = this.users.find(u => u.name === this.activeTeam && u.isGroup);
    
    if (groupConv && groupConv.conversationId) {
      this.selectedConversation = { id: groupConv.conversationId };
      this.loadMessages(groupConv.conversationId);
    } else {
      // Fallback: If no real backend group conversation exists, 
      // we show a descriptive message or the previous mock logic
      console.log(`No API conversation found for ${this.activeTeam} - ${this.activeChannel}`);
      this.messages = []; // Clear for now
    }
  }

  getMemberAvatarColor(senderName: string): string {
    // Look up in users list or generate consistent color based on name
    const user = this.users.find(u => u.name === senderName);
    return user?.avatarColor || '#3b82f6';
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MEETING LINK CLICK â€” FIX: validate then join as participant
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    // Walk up one level in case user clicked the <small> â–¶ Join child
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
      // Browser / dev-server fallback â€” window.location.origin is valid here
      const url = `${window.location.origin}/meeting/${meetingId}?${params}`;
      window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no');
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SHARE MEETING ID â€” FIX: auto-select first user if none selected
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    // Case 1 â€” a conversation is already open, send immediately
    if (this.selectedConversation && this.currentUserId) {
      this.sendMeetingIdMessage(messageText);
      return;
    }

    // Case 2 â€” no conversation open, auto-select first user and send
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SEARCH
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  searchUsers(event: any): void {
    this.searchQuery = event.target.value.toLowerCase();
    this.applySearch();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SCROLL / PAGINATION
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TYPING
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FILE HANDLING
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


  triggerFileInput(): void { this.fileInput.nativeElement.click(); }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MISC HELPERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  private updateSharedFiles() {
    this.sharedFiles = this.messages
      .filter(m => m.fileUrl)
      .map(m => ({
        name: m.fileName || 'Unnamed File',
        size: 'View',
        type: 'file',
        date: this.formatMessageTime(m.sentAt),
        owner: m.senderId?.toString() === this.currentUserId?.toString() ? 'You' : m.senderName,
        url: m.fileUrl
      }))
      .reverse()
      .slice(0, 10);
  }
}
