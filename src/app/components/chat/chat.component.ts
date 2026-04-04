import {
  Component, OnInit, ViewChild, ElementRef,
  AfterViewChecked, OnDestroy, ChangeDetectorRef, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import * as signalR from '@microsoft/signalr';
import { Store } from '@ngrx/store';
import { messagesFeature } from '../../core/state/messages/messages.reducer';
import { MessagesActions } from '../../core/state/messages/messages.actions';
import { notificationsFeature } from '../../core/state/notifications/notifications.reducer';
import { callsFeature } from '../../core/state/calls/calls.reducer';
import { presenceFeature } from '../../core/state/presence/presence.reducer';

import { SessionService } from '../../core/services/session.service';
import { CommonService } from '../../core/services/common.service';
import { UserService } from '../../core/services/user.service';
import { StorageService } from '../../core/services/storage.service';
import { ChatService } from '../../core/services/chat.service';
import { FileService } from '../../core/services/file.service';
import { MeetingService } from '../../core/services/meeting.service';
import { PresenceService } from '../../core/services/presence.service';
import { ChatSignalrService, SendMessageRequest } from '../../core/services/chat-signalr.service';
import { MeetingLinkPipe } from '../../shared/pipes/meeting-link.pipe';
import { CollaborationService } from '../../core/services/collaboration.service';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';
import { CallService, CallType, IncomingCall } from '../../core/services/call.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsService, UserSettings } from '../../core/services/settings.service';
import { PreviewService } from '../../core/services/preview.service';


declare var bootstrap: any;

interface InAppToast {
  id: number;
  senderName: string;
  preview: string;
  avatarColor: string;
  avatarLetter: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, MeetingLinkPipe, SafeHtmlPipe],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  // â”€â”€ User / conversation state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedUser: any = null;
  selectedConversation: any = null;
  favoriteUsers: any[] = [];
  regularUsers: any[] = [];
  currentUserId: string | null = null;
  isEmojiPickerVisible = false;
  commonEmojis = ['👍', '❤️', '😄', '😮', '😢', '🔥', '👏', '✅'];
  showRightPanel: boolean = true;
  mainActiveTab: 'chat' | 'attachments' | 'info' = 'chat';
  attachmentsSearchQuery: string = '';
  groupMembersSearchQuery: string = '';
  // â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  messages: any[] = [];
  newMessage: string = '';
  formattedMessage: string = '';
  replyToMessage: any = null;
  editingMessage: any = null;
  editContent: string = '';

  // Calling state
  incomingCall: IncomingCall | null = null;
  isCalling: boolean = false;
  activeCallUserId: string | null = null;
  callType: CallType = 'Audio';
  isCallHubConnected: boolean = false;
  callHubStatusMessage: string = 'Connecting...';

  // Group creation state
  isGroupModalOpen: boolean = false;
  isCreatingGroup: boolean = false;
  newGroupName: string = '';
  newGroupSearchQuery: string = '';
  selectedGroupMembers: any[] = [];
  groupCreationError: string = '';

  isAddMemberModalOpen: boolean = false;
  isAddingMember: boolean = false;
  addMemberSearchQuery: string = '';
  selectedNewMembers: any[] = [];
  addMemberError: string = '';

  // Mentions
  mentionsVisible: boolean = false;
  mentionSearchQuery: string = '';
  mentionList: any[] = [];
  filteredMentionList: any[] = [];
  mentionSelectedIndex: number = 0;
  mentionsMap: { [userId: string]: string } = {};

  // Group Profile Editing
  isEditingName = false;
  editingNameValue = '';
  isUploadingAvatar = false;

  // Image Cropping
  showCropModal = false;
  imageToCropUrl: string | null = null;
  cropZoom = 1;
  cropTranslateX = 0;
  cropTranslateY = 0;
  isDraggingCrop = false;
  lastDragPos = { x: 0, y: 0 };

  // â”€â”€ UI flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  isLoading: boolean = false;
  isSendingFile: boolean = false;
  isSendingMessage: boolean = false;
  currentPage: number = 1;
  hasMoreMessages: boolean = true;
  isTyping: boolean = false;
  totalUnreadCount: number = 0;
  searchQuery: string = '';
  isConnected: boolean = false;
  isUploading: boolean = false;
  userFilterMode: 'recent' | 'unread' = 'recent';
  isElectron = !!(window as any).windowAPI;
  settings: UserSettings = { showMessagePreview: true, showMediaPreviews: true, notificationsMentionsOnly: false };

  // Sidebar Section Collapse States
  sidebarSections: { [key: string]: boolean } = {
    teams: false,
    favorites: true,
    messages: true
  };


  // â”€â”€ Teams Workspace State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  activeView: 'chat' | 'teams' = 'teams';
  activeTeam: string = '';
  activeChannel: string = '';

  // These will now be populated from the API
  teams: any[] = [];
  channels: string[] = []; // Default fallback channel for groups

  sharedFiles: any[] = [];

  activityFeed: any[] = [];

  // â”€â”€ In-app toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  toasts: InAppToast[] = [];
  private toastCounter = 0;

  // â”€â”€ Image viewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  selectedImage: any = null;

  // â”€â”€ Private state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private typingTimeout: any;
  private callTimeout: any;
  private shouldScroll: boolean = false;
  private destroy$ = new Subject<void>();
  private isCompanyChanging = false;
  private isSwitchingUser = false;
  private conversationSwitch$ = new Subject<void>();
  private companySubscription!: Subscription;
  private syncSubscription!: Subscription;
  private connectionStateSubscription!: Subscription;
  private shareMeetingIdHandler: ((e: Event) => void) | null = null;

  // ——————————————————————————————————————————————————————————————————————————————
  private displayedMessageIds = new Set<string>();


  constructor(
    private sessionService: SessionService,
    private commonService: CommonService,
    private userService: UserService,
    private storageService: StorageService,
    private chatService: ChatService,
    public fileService: FileService,
    private meetingService: MeetingService,     // ← ADDED for validateMeeting
    private chatSignalrService: ChatSignalrService,
    public presenceService: PresenceService,
    private collaborationService: CollaborationService,
    private callService: CallService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private store: Store,
    private settingsService: SettingsService,
    private previewService: PreviewService
  ) {
    this.currentUserId = this.sessionService.getOISMeetUserId();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LIFECYCLE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  ngOnInit(): void {
    this.settingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(s => {
      this.settings = s;
      this.cdr.detectChanges();
    });
    this.currentUserId = this.sessionService.getOISMeetUserId() || null;

    if (this.currentUserId) {
      this.chatSignalrService.startConnection(this.currentUserId);
    }

    this.setupSignalREvents();
    this.setupPresenceTracking();

    this.connectionStateSubscription = this.chatSignalrService.connectionState$
      .subscribe(state => {
        this.isConnected = state === signalR.HubConnectionState.Connected;
        if (state === signalR.HubConnectionState.Connected) {
          this.loadConversations();

          setTimeout(() => {
            if (this.activeView === 'teams') {
              const generalConv = this.users.find(u => u.isGroup && (u.name === 'General' || u.name === 'general' || u.name === 'Marketing Team'));
              if (generalConv) this.selectUser(generalConv);
              else this.selectChannel('General');
            }
          }, 1000);
        }
      });

    // NgRx subscriptions
    this.store.select(messagesFeature.selectByConversation).pipe(takeUntil(this.destroy$)).subscribe(byConv => {
      const convId = this.selectedConversation?.id;
      if (convId && byConv[convId]) {
        const unique = this.getUniqueMessages(byConv[convId]);
        this.messages = this.decorateMessagesWithDates(unique);

        // Ensure displayedMessageIds is in sync
        unique.forEach(m => {
          const id = String(m?.id ?? m?.Id ?? '');
          if (id) this.displayedMessageIds.add(id);
        });

        this.updateSharedFiles();
        this.shouldScroll = true;
      }
    });

    this.store.select(messagesFeature.selectLoading).pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });

    const pendingCompanyId = sessionStorage.getItem('selectedCompanyId');
    if (pendingCompanyId) {
      this.isCompanyChanging = true;
      this.isLoading = true;
    } else {
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
    this.loadActivityFeed();
    this.setupCallSignals();
    this.loadSidebarState();
    this.loadRightPanelState();
  }

  // Sidebar Collapse Logic
  private loadSidebarState(): void {
    const saved = localStorage.getItem('ois_sidebar_state');
    if (saved) {
      try {
        this.sidebarSections = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse sidebar state', e);
      }
    }
  }

  toggleSidebarSection(section: 'teams' | 'favorites' | 'messages'): void {
    this.sidebarSections[section] = !this.sidebarSections[section];
    localStorage.setItem('ois_sidebar_state', JSON.stringify(this.sidebarSections));
  }

  private autoLoadFirstChat(): void {
    if (this.selectedUser) return;

    const firstPin = this.users.find(u => u.isPinned);
    if (firstPin) {
      this.selectUser(firstPin);
      return;
    }

    // Sort users by last message time to find the most recent
    const sorted = [...this.users].sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

    if (sorted.length > 0) {
      this.selectUser(sorted[0]);
    }
  }

  toggleRightPanel(): void {
    this.showRightPanel = !this.showRightPanel;
    this.saveRightPanelState();
  }

  selectMainTab(tab: 'chat' | 'attachments' | 'info'): void {
    this.mainActiveTab = tab;
    // Persist active tab if needed
    localStorage.setItem('ois_main_active_tab', tab);
  }

  private saveRightPanelState(): void {
    localStorage.setItem('ois_right_panel_state', JSON.stringify({
      show: this.showRightPanel
    }));
  }

  private loadRightPanelState(): void {
    const saved = localStorage.getItem('ois_right_panel_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        this.showRightPanel = state.show;
      } catch (e) {
        console.error('Failed to parse right panel state', e);
      }
    }

    const savedTab = localStorage.getItem('ois_main_active_tab');
    if (savedTab === 'attachments' || savedTab === 'chat') {
      this.mainActiveTab = savedTab as any;
    }
  }

  get filteredSharedFiles(): any[] {
    const query = this.attachmentsSearchQuery?.toLowerCase().trim() || '';
    if (!query) return this.sharedFiles;
    return this.sharedFiles.filter(f =>
      f.name.toLowerCase().includes(query) ||
      f.owner.toLowerCase().includes(query) ||
      f.type.toLowerCase().includes(query)
    );
  }

  @ViewChild('messageEditor') messageEditor!: ElementRef;

  // ——————————————————————————————————————————————————————————————————————————————
  // RICH TEXT EDITOR
  // ——————————————————————————————————————————————————————————————————————————————

  formatDoc(command: string, value?: string): void {
    document.execCommand(command, false, value || '');
    this.messageEditor.nativeElement.focus();
  }

  onEditorInput(event: any): void {
    const html = event.target.innerHTML;
    this.formattedMessage = html;
    this.newMessage = event.target.innerText;
    this.checkForMentions(event);
  }

  getFileIcon(type: string): string {
    const t = type?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(t)) return 'bi-file-earmark-image-fill text-info';
    if (['pdf'].includes(t)) return 'bi-file-earmark-pdf-fill text-danger';
    if (['xls', 'xlsx', 'csv'].includes(t)) return 'bi-file-earmark-spreadsheet-fill text-success';
    if (['ppt', 'pptx'].includes(t)) return 'bi-file-earmark-ppt-fill text-warning';
    if (['doc', 'docx'].includes(t)) return 'bi-file-earmark-word-fill text-primary';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return 'bi-file-earmark-zip-fill text-secondary';
    if (['txt', 'md'].includes(t)) return 'bi-file-earmark-text-fill text-muted';
    return 'bi-file-earmark-fill text-primary';
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if (this.mentionsVisible && this.filteredMentionList.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionSelectedIndex = (this.mentionSelectedIndex + 1) % this.filteredMentionList.length;
        this.cdr.detectChanges();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionSelectedIndex = (this.mentionSelectedIndex - 1 + this.filteredMentionList.length) % this.filteredMentionList.length;
        this.cdr.detectChanges();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = this.filteredMentionList[this.mentionSelectedIndex];
        if (selected) {
          this.insertMention(selected);
        }
        return;
      }
      if (event.key === 'Escape') {
        this.mentionsVisible = false;
        return;
      }
    } else if (this.mentionsVisible && event.key === 'Escape') {
      this.mentionsVisible = false;
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private checkForMentions(event: any): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textBefore = range.startContainer.textContent?.substring(0, range.startOffset) || '';
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
      this.mentionsVisible = true;
      this.mentionSearchQuery = atMatch[1].toLowerCase();
      this.filterMentions();
    } else {
      this.mentionsVisible = false;
    }
  }

  private filterMentions(): void {
    this.filteredMentionList = this.mentionList.filter(m =>
      (m.fullName || m.name || '').toLowerCase().includes(this.mentionSearchQuery)
    );
    this.mentionSelectedIndex = 0;
  }

  insertMention(user: any): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const offset = range.startOffset;
    const text = textNode.textContent || '';

    const atIndex = text.lastIndexOf('@', offset - 1);
    if (atIndex === -1) return;

    const before = text.substring(0, atIndex);
    const after = text.substring(offset);

    // Replace text node content
    textNode.textContent = before;

    const mentionSpan = document.createElement('span');
    mentionSpan.className = 'mention';
    mentionSpan.contentEditable = 'false';
    mentionSpan.setAttribute('data-user-id', user.userId || user.id);
    mentionSpan.innerText = `@${user.fullName || user.name}`;

    const spaceNode = document.createTextNode('\u00A0'); // Non-breaking space

    range.insertNode(spaceNode);
    range.insertNode(mentionSpan);

    // Move cursor after the space
    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    this.mentionsVisible = false;
    this.onEditorInput({ target: this.messageEditor.nativeElement });
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // CALLING
  // ——————————————————————————————————————————————————————————————————————————————

  private setupCallSignals(): void {
    if (!this.currentUserId) return;
    this.callService.startConnection(this.currentUserId);

    // Track call hub connection state
    this.callService.connectionState$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.isCallHubConnected = state === signalR.HubConnectionState.Connected;
      this.callHubStatusMessage = state === signalR.HubConnectionState.Connected
        ? 'Connected'
        : state === signalR.HubConnectionState.Reconnecting
          ? 'Reconnecting... Please wait'
          : 'Connecting... Please wait';
      this.cdr.detectChanges();
    });

    this.callService.incomingCall$.pipe(takeUntil(this.destroy$)).subscribe(call => {
      this.incomingCall = call;
      this.cdr.detectChanges();
      this.playCallRingtone();
    });

    this.callService.callAccepted$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      console.log('✅ Call accepted by remote user');
      if (this.callTimeout) clearTimeout(this.callTimeout);
      this.isCalling = false;
      this.openCallWindow(data.byUserId, this.callType, true);
      this.cdr.detectChanges();
    });

    this.callService.callRejected$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      console.log('❌ Call rejected by remote user', data.reason);
      if (this.callTimeout) clearTimeout(this.callTimeout);
      this.isCalling = false;
      alert(`Call rejected: ${data.reason}`);
      this.cdr.detectChanges();
    });
  }

  startCall(type: CallType): void {
    if (!this.selectedUser) return;
    if (!this.isCallHubConnected) {
      alert(this.callHubStatusMessage);
      return;
    }

    console.log(`🚀 Initiating ${type} call to user:`, this.selectedUser.userId);
    this.callType = type;
    this.isCalling = true;

    // Set a fallback timeout (45 seconds) to prevent infinite loading state
    if (this.callTimeout) clearTimeout(this.callTimeout);
    this.callTimeout = setTimeout(() => {
      if (this.isCalling) {
        console.log('⚠️ Call invitation timed out (no response from receiver)');
        this.isCalling = false;
        alert('The user did not answer the call. Please try again later.');
        this.cdr.detectChanges();
      }
    }, 45000);

    const name = this.sessionService.getFullName() || 'User';
    this.callService.startCall(this.selectedUser.userId, name, type)
      .then(() => {
        console.log('✅ StartCall request sent to hub');
      })
      .catch(err => {
        console.error('❌ Failed to start call invocation:', err);
        if (this.callTimeout) clearTimeout(this.callTimeout);
        this.isCalling = false;
        alert('Could not start call. Please ensure you are connected and try again.');
        this.cdr.detectChanges();
      });
  }

  acceptIncomingCall(): void {
    if (!this.incomingCall) return;
    this.callService.acceptCall(this.incomingCall.fromUserId);
    this.openCallWindow(this.incomingCall.fromUserId, this.incomingCall.callType, false);
    this.incomingCall = null;
    this.stopCallRingtone();
  }

  rejectIncomingCall(): void {
    if (!this.incomingCall) return;
    this.callService.rejectCall(this.incomingCall.fromUserId, 'Busy');
    this.incomingCall = null;
    this.stopCallRingtone();
  }

  private openCallWindow(userId: string, type: CallType, isInitiator: boolean): void {
    // Generate a secure room ID based on both users
    const sorted = [this.currentUserId, userId].sort();
    const roomId = `call_${sorted[0]}_${sorted[1]}`;

    // Use existing meeting logic to open a dedicated 1:1 room
    this.openMeetingWindow(roomId, isInitiator, true, type === 'Video');
  }

  private playCallRingtone(): void {
    // Ringtone logic
  }

  private stopCallRingtone(): void {
    // Stop logic
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
    if (this.callTimeout) clearTimeout(this.callTimeout);
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

    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    const msgType = fileUrl ? 'File' : 'Text';

    this.store.dispatch(MessagesActions.sendMessage({
      conversationId,
      content: content || '',
      messageType: msgType,
      fileUrl,
      fileName,
      replyToMessageId: this.replyToMessage?.id,
      formattedContent: this.formattedMessage
    }));

    if (!fileUrl) {
      this.clearEditor();
    }
    this.cdr.detectChanges();
  }

  private clearEditor(): void {
    this.newMessage = '';
    this.formattedMessage = '';
    this.replyToMessage = null;
    if (this.messageEditor) {
      this.messageEditor.nativeElement.innerHTML = '';
    }
  }

  replyTo(message: any): void {
    this.replyToMessage = message;
    this.cdr.detectChanges();
  }

  cancelReply(): void {
    this.replyToMessage = null;
    this.cdr.detectChanges();
  }

  deleteMessage(messageId: string): void {
    if (confirm('Are you sure you want to delete this message?')) {
      this.store.dispatch(MessagesActions.deleteMessage({ messageId }));
    }
  }

  editMessage(message: any): void {
    this.editingMessage = { ...message };
    this.editContent = message.content;
    this.cdr.detectChanges();
  }

  saveEdit(): void {
    if (!this.editingMessage || !this.editContent.trim()) return;
    this.store.dispatch(MessagesActions.editMessage({
      messageId: this.editingMessage.id,
      content: this.editContent.trim()
    }));
    this.editingMessage = null;
    this.editContent = '';
  }

  cancelEdit(): void {
    this.editingMessage = null;
    this.editContent = '';
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



  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // COMPANY CHANGE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  openPreview(file: any): void {
    const url = this.fileService.getFileUrl(file.fileUrl || file.FileUrl || file.url);
    const name = file.fileName || file.FileName || file.name;
    const type = name.split('.').pop()?.toLowerCase() || '';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(type);

    this.previewService.open({
      fileName: name,
      fileUrl: url,
      fileType: type,
      uploader: file.senderName || file.owner || 'System',
      timestamp: file.sentAt ? new Date(file.sentAt).toLocaleString() : file.date || 'Recently',
      allowEdit: isOffice // Demonstrate editing for office files
    });
  }

  private handleCompanyChange(): void {
    this.users = [];
    this.filteredUsers = [];
    this.selectedUser = null;
    this.messages = [];
    this.isLoading = true;
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
              id: u.id?.toString(),
              userId: u.ssoUserId || u.id?.toString(),
              name: u.fullName || u.name || u.userName || 'Unknown',
              fullName: u.fullName || u.name || u.userName || 'Unknown',
              email: u.email || '',
              isOnline: u.isOnline || false,
              lastMessage: '',
              lastMessageTime: '',
              lastMessageType: '',
              lastMessageAt: null as Date | null,
              unreadCount: 0,
              avatarColor: this.commonService.getRandomColor(),
              status: 'Available',
              isGroup: false,
              isSelf: u.id?.toString() === this.currentUserId?.toString()
            })).map((u: any) => {
              if (u.isSelf) {
                u.name = u.name + ' (You)';
                u.fullName = u.fullName + ' (You)';
              }
              return u;
            });

            // Ensure self exists in the list for "Chat with yourself" (MS Teams style)
            const currentUserIdString = this.currentUserId?.toString();
            if (currentUserIdString && !transformed.some((u: any) => u.id === currentUserIdString)) {
              const fullName = this.sessionService.getFullName() || 'Me';
              transformed.unshift({
                id: currentUserIdString,
                userId: currentUserIdString,
                name: fullName + ' (You)',
                fullName: fullName + ' (You)',
                email: '',
                isOnline: true,
                lastMessage: '',
                lastMessageTime: '',
                lastMessageType: '',
                lastMessageAt: null as Date | null,
                unreadCount: 0,
                avatarColor: this.commonService.getRandomColor(),
                status: 'Available',
                isGroup: false,
                isSelf: true
              });
            }

            const allUsers = transformed;

            // Merge with existing state to preserve conversationId / lastMessage
            allUsers.forEach((newUser: any) => {
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
            this.users = allUsers;
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

    this.chatSignalrService.memberAdded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(convId => {
        if (convId) {
          this.loadConversations();
          if (this.selectedConversation?.id === convId) {
            this.loadMessages(convId);
          }
        }
      });

    this.chatSignalrService.groupInfoUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data && data.conversationId) {
          const convId = data.conversationId.toString();
          const user = this.users.find(u => u.conversationId?.toString() === convId);
          if (user) {
            if (data.groupName) {
              user.name = data.groupName;
              user.fullName = data.groupName;
            }
            if (data.avatarUrl) {
              user.avatarUrl = data.avatarUrl;
            }
            this.users = [...this.users];
            this.applySearch();
            this.cdr.detectChanges();
          }
        }
      });
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

    // One more check against current messages array directly
    if (msgId && this.messages.some(m => String(m?.id ?? m?.Id ?? '') === msgId)) return;


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
      const preview = this.settings.showMessagePreview ?
        ((message.messageType || message.MessageType) === 'Text' ? ((message.content || message.Content) ?? '').substring(0, 60) :
          (message.messageType || message.MessageType) === 'Image' ? '📷 Image' : '📎 File Shared') : 'New message received';

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

    const type = message.messageType || message.MessageType || '';
    user.lastMessage =
      type === 'Text' ? (message.content ?? message.Content ?? '') :
        type === 'Image' ? '📷 Image' : `📎 ${message.attachments?.[0]?.fileName || message.Attachments?.[0]?.FileName || 'File'}`;
    const parsedSent = this.parseDate(message.sentAt ?? Date.now()) ?? new Date();
    user.lastMessageTime = this.formatMessageTime(parsedSent);
    user.lastMessageType = message.messageType;
    user.lastMessageAt = parsedSent;

    this.sortUsersByLastMessage();
  }

  private findUserByConversationOrSender(conversationId: string, senderId?: string): any {
    const convId = conversationId?.toString();
    const sender = senderId?.toString();

    return (
      this.users.find(u => u.conversationId?.toString() === convId) ||
      (sender && this.users.find(u =>
        u.id?.toString() === sender ||
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

  setUserFilterMode(mode: 'recent' | 'unread'): void {
    this.userFilterMode = mode;
    this.applySearch();
  }

  private applySearch(): void {
    this.sortUsersByLastMessage();
    const q = (this.searchQuery || '').toLowerCase().trim();

    // First, filter by mode if needed
    let result = [...this.users];
    if (this.userFilterMode === 'unread') {
      result = result.filter(u => (u.unreadCount || 0) > 0);
    }

    // Then, filter by search query
    this.filteredUsers = q
      ? result.filter(u =>
        (u.fullName || u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
      : result;

    this.favoriteUsers = this.filteredUsers.filter(u => u.isPinned && (u.name || u.fullName));
    this.regularUsers = this.filteredUsers.filter(u => !u.isPinned && (u.name || u.fullName));

    this.cdr.detectChanges();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NOTIFICATIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  showInAppToast(senderName: string, preview: string, avatarColor: string): void {
    const toast: InAppToast = {
      id: ++this.toastCounter,
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


  private showBrowserNotification(title: string, body: string): void {
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.showNotification === 'function') {
      electronApi.showNotification({ title, body }).catch(() => { });
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
            const participants = conv.participants || [];
            const other = participants.find((p: any) => p.userId?.toString() !== this.currentUserId?.toString()) || (participants.length > 0 ? participants[0] : {});

            // For groups, uniquely identify by conversationId. For direct, by other user's id.
            let user = isGroup
              ? this.users.find(u => u.conversationId === conv.id?.toString())
              : this.users.find(u => u.id?.toString() === other.userId?.toString());

            if (user) {
              user.conversationId = conv.id?.toString();
              user.isGroup = isGroup;
              if (isGroup) {
                user.name = conv.groupName || user.name;
                user.fullName = conv.groupName || user.fullName;
                user.avatarUrl = conv.groupAvatarUrl || user.avatarUrl;
              }
              const lastMsg = conv.lastMessage;
              const type = lastMsg?.messageType || lastMsg?.MessageType || '';
              user.lastMessage = (type === 'File') ? '📎 File Shared' :
                (type === 'Image') ? '📷 Image' :
                  (lastMsg?.content || lastMsg?.Content || '');
              user.lastMessageTime = lastMsg?.sentAt ? this.formatMessageTime(this.parseDate(lastMsg.sentAt)) : '';
              user.lastMessageType = type;
              user.lastMessageAt = lastMsg?.sentAt ? this.parseDate(lastMsg.sentAt) : null;
              user.unreadCount = conv.unreadCount || 0;
            } else {
              this.users.push({
                id: isGroup ? conv.id?.toString() : other.userId?.toString(),
                userId: isGroup ? null : other.userId?.toString(),
                name: isGroup ? (conv.groupName || '') : (other.name || other.fullName || ''),
                fullName: isGroup ? (conv.groupName || '') : (other.name || other.fullName || ''),
                email: other.email || '',
                isOnline: isGroup ? true : (other.isOnline || false),
                lastMessage: (conv.lastMessage?.messageType || conv.lastMessage?.MessageType) === 'File' ? '📎 File Shared' :
                  (conv.lastMessage?.messageType || conv.lastMessage?.MessageType) === 'Image' ? '📷 Image' :
                    (conv.lastMessage?.content || conv.lastMessage?.Content || ''),
                lastMessageTime: conv.lastMessage?.sentAt
                  ? this.formatMessageTime(this.parseDate(conv.lastMessage.sentAt)) : '',
                lastMessageType: conv.lastMessage?.messageType || conv.lastMessage?.MessageType || '',
                lastMessageAt: conv.lastMessage?.sentAt
                  ? this.parseDate(conv.lastMessage.sentAt) : null,
                unreadCount: conv.unreadCount || 0,
                conversationId: conv.id?.toString(),
                avatarColor: this.commonService.getRandomColor(),
                avatarUrl: isGroup ? conv.groupAvatarUrl : other.avatarUrl,
                isGroup: isGroup,
                isPinned: conv.isPinned || false,
                participants: participants
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
          this.applySearch();

          if (!this.selectedUser) {
            this.autoLoadFirstChat();
          }
        },
        error: (err) => console.error('Failed to load conversations', err)
      });
  }

  loadMessages(conversationId: string): void {
    if (!conversationId) return;
    this.store.dispatch(MessagesActions.loadConversationMessages({
      conversationId,
      page: this.currentPage
    }));
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

    // Update UI immediately (local optimistic update, though store will sync)
    this.messages = this.messages.map(m => {
      if (unreadIds.includes(m.id?.toString())) {
        return { ...m, isRead: true, isDelivered: true };
      }
      return m;
    });

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
    this.clearEditor();
    this.currentPage = 1;
    this.hasMoreMessages = true;
    this.isLoading = false;

    if (user.unreadCount > 0) {
      user.unreadCount = 0;
      this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
      this.users = [...this.users];
    }

    if (user.conversationId) {
      this.selectedConversation = { id: user.conversationId };
      try {
        await this.chatSignalrService.joinConversation(user.conversationId);
        this.loadMessages(user.conversationId);

        // Load mention list for this conversation
        if (user.isGroup) {
          // Use participants list from the conversation object
          this.mentionList = (user.participants || [])
            .filter((p: any) => p.userId?.toString() !== this.currentUserId?.toString())
            .map((p: any) => ({
              id: p.userId?.toString(),
              userId: p.userId?.toString(),
              fullName: p.name || p.fullName,
              name: p.name || p.fullName,
              avatarColor: this.getMemberAvatarColor(p.name || p.fullName)
            }));
        } else {
          this.mentionList = [user];
        }
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
              const convId = res.data?.toString();
              user.conversationId = convId;
              this.selectedConversation = { id: convId };
              try {
                await this.chatSignalrService.joinConversation(convId);
                this.loadMessages(convId);
                this.mentionList = [user];
              } catch (err) {
                console.error('Failed to join conversation:', err);
              }
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
  }

  togglePin(event: MouseEvent, user: any): void {
    event.stopPropagation();
    const isPinned = !user.isPinned;
    user.isPinned = isPinned;

    if (user.conversationId) {
      this.chatService.togglePinConversation(user.conversationId, isPinned).subscribe({
        next: () => {
          this.applySearch();
        },
        error: () => {
          user.isPinned = !isPinned; // revert
        }
      });
    }
  }

  selectTeam(team: any): void {
    this.activeTeam = team.name;
    team.avatarColor = team.color;
    team.icon = team.icon;
    team.isGroup = true;
    team.name = team.name;
    this.selectedUser = team;
    this.selectChannel(team.channels[0]);
  }

  selectChannel(channel: string): void {
    this.activeChannel = channel;
    this.messages = [];
    this.currentPage = 1;
    this.hasMoreMessages = true;

    const groupConv = this.users.find(u => u.name === this.activeTeam && u.isGroup);

    if (groupConv && groupConv.conversationId) {
      this.selectedConversation = { id: groupConv.conversationId };
      this.loadMessages(groupConv.conversationId);
    } else {
      console.log(`No active conversation found for ${this.activeTeam}`);
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
    const userId = this.sessionService.getOISMeetUserId();
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
    isHost: boolean,
    mic = false,
    cam = false
  ): void {
    const params = new URLSearchParams({
      host: String(isHost),
      topic: 'OIS Meet',
      mic: String(mic),
      cam: String(cam),
    });

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.openMeetingWindow === 'function') {
      // Send structured payload so main.js can use loadFile() in production
      electronApi.openMeetingWindow({
        routePath: `/meeting/${meetingId}`,
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
      if (status === 'Read') { msg.isRead = true; msg.isDelivered = true; }
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
        id: otherUser.userId,
        conversationId: conversation.id,
        avatarColor: this.commonService.getRandomColor()
      }, ...this.users];
      this.applySearch();
    }
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

  downloadAttachment(attachment: any): void { if (attachment) this.downloadFile(attachment.fileUrl, attachment.fileName); }


  viewImage(message: any): void {
    this.selectedImage = {
      fileName: message.fileName || message.attachments?.[0]?.fileName,
      fileUrl: message.fileUrl || message.attachments?.[0]?.fileUrl
    };
    new bootstrap.Modal(document.getElementById('imageViewerModal')).show();
  }

  startVoiceCall(): void { }
  startVideoCall(): void { }
  loadUnreadCount(): void { }

  // ——————————————————————————————————————————————————————————————————————————————
  // REACTIONS
  // ——————————————————————————————————————————————————————————————————————————————

  toggleReaction(message: any, emoji: string): void {
    const userId = this.currentUserId;
    if (!userId) return;

    const existing = message.reactions?.find((r: any) =>
      String(r.userId) === String(userId) && r.emoji === emoji
    );

    if (existing) {
      this.store.dispatch(MessagesActions.removeReaction({ messageId: message.id, emoji }));
    } else {
      this.store.dispatch(MessagesActions.addReaction({ messageId: message.id, emoji }));
    }
  }

  hasReacted(message: any, emoji: string): boolean {
    if (!this.currentUserId || !message.reactions) return false;
    return message.reactions.some((r: any) =>
      String(r.userId) === String(this.currentUserId) && r.emoji === emoji
    );
  }

  getReactionCount(message: any, emoji: string): number {
    if (!message.reactions) return 0;
    return message.reactions.filter((r: any) => r.emoji === emoji).length;
  }

  getReactionUsers(message: any, emoji: string): string {
    if (!message.reactions) return '';
    return message.reactions
      .filter((r: any) => r.emoji === emoji)
      .map((r: any) => r.userName || 'Someone')
      .join(', ');
  }

  showEmojiPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.isEmojiPickerVisible = !this.isEmojiPickerVisible;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isEmojiPickerVisible) {
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker-container')) {
        this.isEmojiPickerVisible = false;
        this.cdr.detectChanges();
      }
    }
  }

  addEmoji(emoji: string): void {
    if (this.messageEditor?.nativeElement) {
      this.messageEditor.nativeElement.focus();
      document.execCommand('insertText', false, emoji);
      // Update bound model
      this.newMessage = this.messageEditor.nativeElement.innerText;
      this.formattedMessage = this.messageEditor.nativeElement.innerHTML;
    }
    this.isEmojiPickerVisible = false;
  }

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
    if (dm < 1) return 'Just now';
    if (dm < 60) return `${dm}m ago`;
    if (dm < 1440) return `${Math.floor(dm / 60)}h ago`;
    if (dm < 2880) return 'Yesterday';
    return d.toLocaleDateString();
  }

  getFileSize(bytes: number | undefined | null): string {
    if (!bytes) return '0 Bytes';
    const k = 1024, s = ['Bytes', 'KB', 'MB', 'GB'];
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
    const allFiles: any[] = [];
    this.messages.forEach(m => {
      const msgFiles: any[] = [];
      const fileUrl = m.fileUrl || m.FileUrl;
      if (fileUrl) {
        msgFiles.push({
          name: m.fileName || m.FileName || 'Unnamed File',
          url: fileUrl,
          sentAt: m.sentAt || m.SentAt,
          sender: m.senderId?.toString() === this.currentUserId?.toString() ? 'You' : (m.senderName || m.SenderName || 'Unknown')
        });
      }
      const attachments = m.attachments || m.Attachments || [];
      attachments.forEach((a: any) => {
        msgFiles.push({
          name: a.fileName || a.FileName || 'Unnamed File',
          url: a.fileUrl || a.FileUrl,
          sentAt: m.sentAt || m.SentAt,
          sender: m.senderId?.toString() === this.currentUserId?.toString() ? 'You' : (m.senderName || m.SenderName || 'Unknown')
        });
      });

      msgFiles.forEach(f => {
        allFiles.push({
          name: f.name,
          size: 'View',
          type: f.name.split('.').pop()?.toLowerCase() || 'file',
          date: this.formatMessageTime(f.sentAt),
          owner: f.sender,
          url: f.url
        });
      });
    });
    this.sharedFiles = allFiles.reverse();
  }

  private getUniqueMessages(msgs: any[]): any[] {
    const seen = new Set<string>();
    return msgs.filter(m => {
      const id = String(m?.id ?? m?.Id ?? '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private scrollToBottom(): void {
    try {
      this.chatMessagesContainer.nativeElement.scrollTop = this.chatMessagesContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  private requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { });
    }
  }

  private handleShareMeetingId(meetingId: string, text: string): void {
    const messageText = text || `Join my meeting! Meeting ID: ${meetingId}`;
    if (this.selectedConversation && this.currentUserId) {
      this.sendMeetingIdMessage(messageText);
    } else {
      const firstUser = this.users[0];
      if (firstUser) {
        this.selectUser(firstUser).then(() => {
          setTimeout(() => {
            if (this.selectedConversation) this.sendMeetingIdMessage(messageText);
          }, 500);
        });
      }
    }
  }

  get filteredGroupMembers(): any[] {
    if (!this.selectedUser || !this.selectedUser.isGroup || !this.selectedUser.participants) return [];
    const q = this.groupMembersSearchQuery.toLowerCase().trim();
    return this.selectedUser.participants
      .filter((p: any) =>
        (p.name || p.fullName || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
      .map((p: any) => ({
        ...p,
        isOnline: this.presenceService.isOnline(p.userId)
      }));
  }

  private sendMeetingIdMessage(text: string): void {
    if (!this.selectedConversation || !this.currentUserId) return;
    this.store.dispatch(MessagesActions.sendMessage({
      conversationId: this.selectedConversation.id,
      content: text,
      messageType: 'Text'
    }));
  }

  private loadActivityFeed(): void {
    this.collaborationService.getActivity(20).subscribe({
      next: (res) => {
        this.activityFeed = (res.data ?? []).map((item: any) => ({
          user: item.title,
          action: item.body || item.activityType || 'Activity',
          time: this.formatMessageTime(item.createdAt)
        }));
      },
      error: () => {
        this.activityFeed = [];
      }
    });
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // GROUP CREATION
  // ——————————————————————————————————————————————————————————————————————————————

  openGroupModal(): void {
    this.isGroupModalOpen = true;
    this.newGroupName = '';
    this.newGroupSearchQuery = '';
    this.selectedGroupMembers = [];
    this.groupCreationError = '';
  }

  closeGroupModal(): void {
    this.isGroupModalOpen = false;
    this.groupCreationError = '';
  }

  get groupModalFilteredUsers(): any[] {
    const q = this.newGroupSearchQuery.toLowerCase().trim();
    return this.users.filter(u =>
      !u.isGroup &&
      !u.isSelf && (u.fullName || u.name) &&
      (q === '' || (u.fullName || u.name).toLowerCase().includes(q))
    );
  }

  isGroupMemberSelected(user: any): boolean {
    return this.selectedGroupMembers.some(m => m.id === user.id);
  }

  toggleGroupMember(user: any): void {
    if (this.isGroupMemberSelected(user)) {
      this.selectedGroupMembers = this.selectedGroupMembers.filter(m => m.id !== user.id);
    } else {
      this.selectedGroupMembers = [...this.selectedGroupMembers, user];
    }
  }

  createGroup(): void {
    this.groupCreationError = '';

    // Validate
    if (!this.newGroupName.trim()) {
      this.groupCreationError = 'Please enter a group name.';
      return;
    }
    if (this.selectedGroupMembers.length < 2) {
      this.groupCreationError = 'Please select at least 2 participants.';
      return;
    }

    this.isCreatingGroup = true;
    const participantIds = this.selectedGroupMembers.map(u => u.id);

    this.chatService.createGroupConversation(this.newGroupName.trim(), participantIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isCreatingGroup = false;
          if (res.success && res.data) {
            const convId = res.data.id?.toString() || res.data?.toString();
            const newGroup: any = {
              id: convId,
              userId: null,
              name: this.newGroupName.trim(),
              fullName: this.newGroupName.trim(),
              email: '',
              isOnline: true,
              lastMessage: '',
              lastMessageTime: '',
              lastMessageType: '',
              lastMessageAt: null,
              unreadCount: 0,
              conversationId: convId,
              avatarColor: this.commonService.getRandomColor(),
              isGroup: true
            };
            this.users = [newGroup, ...this.users];
            this.updateTeamsList();
            this.applySearch();
            this.closeGroupModal();
            this.selectUser(newGroup);
          } else {
            this.groupCreationError = res.message || 'Failed to create group. Please try again.';
          }
        },
        error: (err) => {
          this.isCreatingGroup = false;
          this.groupCreationError = 'An error occurred. Please check your connection and try again.';
          console.error('Group creation failed:', err);
        }
      });
  }

  clearGroupSearch() {
    this.newGroupSearchQuery = '';
  }

  // --- ADD MEMBER TO GROUP ---

  openAddMemberModal(): void {
    this.isAddMemberModalOpen = true;
    this.addMemberSearchQuery = '';
    this.selectedNewMembers = [];
    this.addMemberError = '';
  }

  closeAddMemberModal(): void {
    this.isAddMemberModalOpen = false;
    this.addMemberError = '';
  }

  get addMemberFilteredUsers(): any[] {
    if (!this.selectedUser || !this.selectedUser.isGroup) return [];
    const q = this.addMemberSearchQuery.toLowerCase().trim();
    const existingIds = (this.selectedUser.participants || []).map((p: any) => p.userId?.toString());

    return this.users.filter(u =>
      !u.isGroup &&
      !u.isSelf &&
      !existingIds.includes(u.id?.toString()) &&
      (q === '' || (u.fullName || u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    );
  }

  isNewMemberSelected(user: any): boolean {
    return this.selectedNewMembers.some(m => m.id === user.id);
  }

  toggleNewMember(user: any): void {
    if (this.isNewMemberSelected(user)) {
      this.selectedNewMembers = this.selectedNewMembers.filter(m => m.id !== user.id);
    } else {
      this.selectedNewMembers = [...this.selectedNewMembers, user];
    }
  }

  addMembers(): void {
    if (!this.selectedConversation || this.selectedNewMembers.length === 0) return;

    this.isAddingMember = true;
    this.addMemberError = '';
    const userIds = this.selectedNewMembers.map(m => m.id?.toString());

    this.chatService.addMemberToConversation(this.selectedConversation.id, userIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isAddingMember = false;
          if (res.success) {
            this.closeAddMemberModal();
            // Refresh conversation data to show new members
            // SignalR should handle the live update if implemented, but we can manually refresh
            this.loadConversations();
          } else {
            this.addMemberError = res.message || 'Failed to add members.';
          }
        },
        error: (err) => {
          this.isAddingMember = false;
          this.addMemberError = 'An error occurred. Please try again.';
          console.error('Add member failed:', err);
        }
      });
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // GROUP INFO EDITING
  // ——————————————————————————————————————————————————————————————————————————————

  startEditingName(): void {
    if (!this.selectedUser?.isGroup) return;
    this.isEditingName = true;
    this.editingNameValue = this.selectedUser.name;
    this.cdr.detectChanges();
  }

  cancelEditingName(): void {
    this.isEditingName = false;
    this.editingNameValue = '';
  }

  saveGroupName(): void {
    if (!this.selectedUser?.isGroup || !this.editingNameValue.trim()) {
      this.isEditingName = false;
      return;
    }

    const newName = this.editingNameValue.trim();
    if (newName === this.selectedUser.name) {
      this.isEditingName = false;
      return;
    }

    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    this.chatService.updateGroupInfo(conversationId, newName).subscribe({
      next: (res) => {
        if (res.success) {
          this.selectedUser.name = newName;
          this.selectedUser.fullName = newName;
          this.isEditingName = false;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to update group name:', err);
        alert('Failed to update group name. Please try again.');
        this.isEditingName = false;
      }
    });
  }

  // --- AVATAR UPLOAD & CROP ---

  onAvatarClick(fileInput: HTMLInputElement): void {
    if (!this.selectedUser?.isGroup) return;
    fileInput.click();
  }

  onAvatarFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image (JPG, PNG, or WEBP)');
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large. Max size is 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.imageToCropUrl = e.target.result;
      this.showCropModal = true;
      this.resetCropState();
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  }

  private resetCropState(): void {
    this.cropZoom = 1;
    this.cropTranslateX = 0;
    this.cropTranslateY = 0;
  }

  @HostListener('window:mousemove', ['$event'])
  onCropDrag(event: MouseEvent): void {
    if (!this.isDraggingCrop) return;
    const dx = event.clientX - this.lastDragPos.x;
    const dy = event.clientY - this.lastDragPos.y;
    this.cropTranslateX += dx;
    this.cropTranslateY += dy;
    this.lastDragPos = { x: event.clientX, y: event.clientY };
  }

  @HostListener('window:mouseup')
  stopCropDrag(): void {
    this.isDraggingCrop = false;
  }

  startCropDrag(event: MouseEvent): void {
    this.isDraggingCrop = true;
    this.lastDragPos = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }

  handleCropScroll(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    this.cropZoom = Math.max(0.5, Math.min(5, this.cropZoom + delta));
  }

  confirmCrop(): void {
    // In a real app, we'd use a canvas to crop the image based on zoom/translate.
    // For this demo, we'll simulate it by uploading the current image after processing it via a canvas.
    this.isUploadingAvatar = true;
    this.showCropModal = false;

    // Create a 1:1 canvas
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.src = this.imageToCropUrl!;
    img.onload = () => {
      if (!ctx) return;
      
      // Calculate drawing dimensions
      const aspect = img.width / img.height;
      let drawW, drawH;
      if (aspect > 1) {
        drawH = size * this.cropZoom;
        drawW = drawH * aspect;
      } else {
        drawW = size * this.cropZoom;
        drawH = drawW / aspect;
      }

      const x = (size / 2) + this.cropTranslateX - (drawW / 2);
      const y = (size / 2) + this.cropTranslateY - (drawH / 2);

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, x, y, drawW, drawH);

      canvas.toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
          this.uploadGroupAvatar(croppedFile);
        }
      }, 'image/jpeg', 0.9);
    };
  }

  private uploadGroupAvatar(file: File): void {
    this.fileService.uploadFile(file).subscribe({
      next: (event: any) => {
        if (event.type === 4) { // Sent
          const res = event.body;
          if (res.success && res.data) {
            const avatarUrl = res.data.url;
            this.saveGroupAvatar(avatarUrl);
          }
          this.isUploadingAvatar = false;
        }
      },
      error: (err) => {
        console.error('Avatar upload failed', err);
        this.isUploadingAvatar = false;
        alert('Failed to upload avatar. Please try again.');
      }
    });
  }

  private saveGroupAvatar(avatarUrl: string): void {
    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    this.chatService.updateGroupInfo(conversationId, undefined, avatarUrl).subscribe({
      next: (res) => {
        if (res.success) {
          this.selectedUser.avatarUrl = avatarUrl;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to update group avatar:', err);
      }
    });
  }
}
