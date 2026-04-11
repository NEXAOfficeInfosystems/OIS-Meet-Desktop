import {
  Component, OnInit, ViewChild, ElementRef,
  AfterViewChecked, OnDestroy, ChangeDetectorRef, HostListener,
  effect, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
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
import { NotificationService } from '../../core/services/notification.service';
import { NotificationRecipient } from '../../core/models/notification.models';
import { ActivityFeedComponent } from '../activity-feed/activity-feed.component';
import { SignalRService } from '../../core/services/signalr.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../../shared/layout/confirmation-dialog.component';
import { EmojiStickerPickerComponent, PickerTab } from '../../shared/components/emoji-sticker-picker/emoji-sticker-picker.component';


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
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MeetingLinkPipe,
    SafeHtmlPipe,
    ActivityFeedComponent,
    EmojiStickerPickerComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  private showAlert(message: string, title: string = 'Notice') {
    this.dialog.open(ConfirmationDialogComponent, {
      data: { title, message, isAlert: true, type: 'info' }
    });
  }

  private showConfirm(message: string, confirmText: string = 'Confirm', callback: () => void) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Confirm Action', message, type: 'warning', confirmText, isDestructive: true }
    });
    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) callback();
    });
  }

  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  // ——————————————————————————————————————————————————————————————————————————————
  viewMode = signal<'chat' | 'activity'>('chat');
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedUser: any = null;
  selectedConversation: any = null;
  favoriteUsers: any[] = [];
  regularUsers: any[] = [];
  currentUserId: string | null = null;
  // ── Unified emoji/sticker picker state ──────────────────────────────────────
  // 'compose' = main footer picker, 'edit' = inline message edit picker
  isPickerVisible: { compose: boolean; edit: boolean } = { compose: false, edit: false };
  pickerInitialTab: PickerTab = 'emoji';
  pickerPosition: { top: number; left: number } = { top: 0, left: 0 };
  // Kept for reaction bar (small inline quick-react strip — unchanged)
  commonEmojis = ['👍', '❤️', '😄', '😮', '😢', '🔥', '👏', '✅'];
  showRightPanel: boolean = true;
  mainActiveTab: 'chat' | 'attachments' | 'info' = 'chat';
  attachmentsSearchQuery: string = '';
  groupMembersSearchQuery: string = '';
  // ——————————————————————————————————————————————————————————————————————————————
  messages: any[] = [];
  newMessage: string = '';
  formattedMessage: string = '';
  replyToMessage: any = null;
  editingMessage: any = null;
  editContent: string = '';

  // Calling state
  incomingCall: IncomingCall | null = null;
  isCalling: boolean = false;
  isGroupCallStarting: boolean = false;
  activeCallUserId: string | null = null;
  activeCallUserName: string = '';
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

  // ——————————————————————————————————————————————————————————————————————————————
  isLoading: boolean = false;
  isSendingFile: boolean = false;
  isSendingMessage: boolean = false;
  currentPage: number = 1;
  hasMoreMessages: boolean = true;
  isTyping: boolean = false;
  totalUnreadCount: number = 0;
  searchQuery: string = '';
  isSidebarSearching: boolean = false;
  isConnected: boolean = false;
  isUploading: boolean = false;
  isToolbarVisible: boolean = false;
  // Active format state for toolbar button highlights
  formatState: Record<string, boolean> = {
    bold: false, italic: false, underline: false, strikeThrough: false,
    insertUnorderedList: false, insertOrderedList: false
  };
  // Inline-edit rich text content (HTML)
  editFormattedContent: string = '';

  toggleSidebarSearch(): void {
    this.isSidebarSearching = !this.isSidebarSearching;
    if (!this.isSidebarSearching) {
      this.searchQuery = '';
      this.applySearch();
    }
  }
  userFilterMode: 'recent' | 'unread' = 'recent';
  isElectron = !!(window as any).windowAPI;
  settings: UserSettings = { showMessagePreview: true, showMediaPreviews: true, notificationsMentionsOnly: false };

  toggleToolbar(): void {
    this.isToolbarVisible = !this.isToolbarVisible;
    this.cdr.detectChanges();
  }

  // Sidebar Section Collapse States
  sidebarSections: { [key: string]: boolean } = {
    teams: false,
    favorites: true,
    messages: true
  };


  // ——————————————————————————————————————————————————————————————————————————————
  activeView: 'chat' | 'teams' = 'teams';
  activeTeam: string = '';
  activeChannel: string = '';

  // These will now be populated from the API
  teams: any[] = [];
  channels: string[] = []; // Default fallback channel for groups

  sharedFiles: any[] = [];

  activityFeed: any[] = [];

  // ——————————————————————————————————————————————————————————————————————————————
  toasts: InAppToast[] = [];
  private toastCounter = 0;

  // ——————————————————————————————————————————————————————————————————————————————
  selectedImage: any = null;

  // ——————————————————————————————————————————————————————————————————————————————
  activeReactionMsgId: string | null = null;  // tracks which message's emoji picker is open

  private typingTimeout: any;
  private callTimeout: any;
  private shouldScroll: boolean = false;
  private _initialLoadConvId: string | null = null;
  private _scrollToMessageIndex: number | null = null;
  private destroy$ = new Subject<void>();
  isCompanyChanging = false;
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
    private route: ActivatedRoute,
    private store: Store,
    private settingsService: SettingsService,
    private previewService: PreviewService,
    public notificationService: NotificationService,
    private signalRService: SignalRService,
    private dialog: MatDialog
  ) {
    this.currentUserId = this.sessionService.getOISMeetUserId();

    // Wire up activity selection to chat loading
    // Wire up notification selection to chat loading
    effect(() => {
      const selected = this.notificationService.selectedNotification();
      const mode = this.viewMode();
      if (selected && mode === 'activity') {
        this.handleNotificationSelection(selected);
      }
    });

    effect(() => {
      const outgoingCall = this.callService.outgoingCall();

      if (!outgoingCall && this.isCalling) {
        this.resetOutgoingCallState();
      }
    });
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // LIFECYCLE
  // ——————————————————————————————————————————————————————————————————————————————

  ngOnInit(): void {
    this.settingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(s => {
      this.settings = s;
      this.cdr.detectChanges();
    });

    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.viewMode.set(data['viewMode'] || 'chat');
      if (this.viewMode() === 'activity') {
        this.notificationService.loadInitial();
      }
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

        if (this._initialLoadConvId === convId) {
          // First message batch for this conversation — mark read and scroll to first unread.
          this._initialLoadConvId = null;
          setTimeout(() => this.markAllUnreadAsRead(convId), 200);
          const firstUnread = this.messages.findIndex(m =>
            m.senderId?.toString() !== this.currentUserId?.toString() && !m.isRead
          );
          if (firstUnread !== -1) {
            this._scrollToMessageIndex = firstUnread;
          } else {
            this.shouldScroll = true;
          }
        } else if (this.currentPage === 1) {
          // Real-time message arrived — scroll to bottom.
          this.shouldScroll = true;
        }
        // currentPage > 1 means pagination (load older) — preserve scroll position.
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
  @ViewChild('editEditor') editEditorRef!: ElementRef;

  // ——————————————————————————————————————————————————————————————————————————————
  // RICH TEXT EDITOR
  // ——————————————————————————————————————————————————————————————————————————————

  formatDoc(command: string, value?: string): void {
    this.messageEditor.nativeElement.focus();
    // Toggle formatBlock: if already in the same block type, revert to <p>
    if (command === 'formatBlock' && value) {
      const ctx = this.getCursorBlockContext(this.messageEditor.nativeElement);
      const inSame = (value === 'pre' && (ctx === 'pre' || ctx === 'code')) ||
                     (value === 'blockquote' && ctx === 'blockquote');
      if (inSame) {
        document.execCommand('formatBlock', false, 'p');
        this.updateFormatState();
        this.onEditorInput({ target: this.messageEditor.nativeElement });
        return;
      }
    }
    document.execCommand(command, false, value ?? undefined);
    this.updateFormatState();
    this.onEditorInput({ target: this.messageEditor.nativeElement });
  }

  formatEditDoc(command: string, value?: string): void {
    const el = this.editEditorRef?.nativeElement;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value ?? undefined);
    this.editFormattedContent = el.innerHTML;
    this.editContent = el.innerText;
  }

  updateFormatState(): void {
    const cmds = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];
    for (const cmd of cmds) {
      this.formatState[cmd] = document.queryCommandState(cmd);
    }
    // Detect block-level context for pre / blockquote active states
    const editorEl = this.messageEditor?.nativeElement;
    if (editorEl) {
      const ctx = this.getCursorBlockContext(editorEl);
      this.formatState['pre'] = ctx === 'pre' || ctx === 'code';
      this.formatState['blockquote'] = ctx === 'blockquote';
    }
    this.cdr.markForCheck();
  }

  private getCursorBlockContext(editorEl: HTMLElement): string | null {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    let node: Node | null = selection.anchorNode;
    while (node && node !== editorEl) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();
        if (['li', 'pre', 'blockquote', 'code'].includes(tag)) return tag;
      }
      node = node.parentNode;
    }
    return null;
  }

  onEditorInput(event: any): void {
    const html = event.target.innerHTML;
    this.formattedMessage = html;
    this.newMessage = event.target.innerText;
    this.updateFormatState();
    this.checkForMentions(event);
  }

  onEditEditorInput(event: any): void {
    this.editFormattedContent = event.target.innerHTML;
    this.editContent = event.target.innerText;
  }

  insertLink(): void {
    const url = prompt('Enter URL:');
    if (url) this.formatDoc('createLink', url);
  }

  insertEditLink(): void {
    const url = prompt('Enter URL:');
    if (url) this.formatEditDoc('createLink', url);
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
    // ── Mention popover navigation ─────────────────────────────────────────────
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
        if (selected) this.insertMention(selected);
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

    const ctrl = event.ctrlKey || event.metaKey;

    // ── Rich text keyboard shortcuts ───────────────────────────────────────────
    if (ctrl) {
      switch (event.key.toLowerCase()) {
        case 'b': event.preventDefault(); this.formatDoc('bold'); return;
        case 'i': event.preventDefault(); this.formatDoc('italic'); return;
        case 'u': event.preventDefault(); this.formatDoc('underline'); return;
      }
    }

    // ── Enter key ─────────────────────────────────────────────────────────────
    if (event.key === 'Enter') {
      const ctx = this.getCursorBlockContext(this.messageEditor.nativeElement);

      // Inside a list item: let browser create / exit the <li> naturally
      if (ctx === 'li') {
        setTimeout(() => this.onEditorInput({ target: this.messageEditor.nativeElement }), 0);
        return;
      }

      // Inside a blockquote (no Shift): let browser extend the blockquote
      if (ctx === 'blockquote' && !event.shiftKey) {
        setTimeout(() => this.onEditorInput({ target: this.messageEditor.nativeElement }), 0);
        return;
      }

      // Inside <pre> / <code>: insert a literal newline instead of a block element
      if (ctx === 'pre' || ctx === 'code') {
        event.preventDefault();
        document.execCommand('insertText', false, '\n');
        setTimeout(() => this.onEditorInput({ target: this.messageEditor.nativeElement }), 0);
        return;
      }

      // Shift+Enter outside a block: browser inserts <br> — just sync the model
      if (event.shiftKey) {
        setTimeout(() => this.onEditorInput({ target: this.messageEditor.nativeElement }), 0);
        return;
      }

      // Plain Enter outside any block: send the message
      event.preventDefault();
      this.sendMessage();
      return;
    }

    // ── Tab / Shift+Tab: indent / outdent list items ───────────────────────────
    if (event.key === 'Tab') {
      const ctx = this.getCursorBlockContext(this.messageEditor.nativeElement);
      if (ctx === 'li') {
        event.preventDefault();
        document.execCommand(event.shiftKey ? 'outdent' : 'indent', false);
        setTimeout(() => this.onEditorInput({ target: this.messageEditor.nativeElement }), 0);
        return;
      }
    }

    if (event.key === 'Backspace') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);

      // If at start of a node, see if previous node is a mention
      if (range.collapsed && range.startOffset === 0) {
        const node = range.startContainer;
        let prev = node.previousSibling;

        // Handle nested or adjacent scenarios
        if (!prev && node.parentNode !== this.messageEditor.nativeElement) {
          prev = node.parentNode?.previousSibling || null;
        }

        if (prev && prev instanceof HTMLElement && prev.classList.contains('mention')) {
          event.preventDefault();
          this.suppressMentionCheck = true;
          prev.remove();
          this.onEditorInput({ target: this.messageEditor.nativeElement });
          this.suppressMentionCheck = false;
          this.cdr.detectChanges();
        }
      }
    }
  }

  onEditorPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          event.preventDefault();
          this.uploadFile(file);
        }
      }
    }
  }

  private suppressMentionCheck = false;

  private checkForMentions(event: any): void {
    if (this.suppressMentionCheck) return;
    if (!this.selectedUser?.isGroup) {
      this.mentionsVisible = false;
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const offset = range.startOffset;

    // We only trigger mentions if we're inside a text node
    if (textNode.nodeType !== Node.TEXT_NODE) {
      this.mentionsVisible = false;
      return;
    }

    const textBefore = textNode.textContent?.substring(0, offset) || '';
    // Look for @ followed by word characters up to the cursor
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
      // Ensure there's a space/newline before @, or it's the start of the node
      const matchIndex = atMatch.index || 0;
      const atPos = textBefore.lastIndexOf('@' + atMatch[1]);
      
      if (atPos > 0) {
        const charBefore = textBefore.charAt(atPos - 1);
        if (charBefore !== ' ' && charBefore !== '\n' && charBefore !== '\u00A0') {
          this.mentionsVisible = false;
          return;
        }
      }

      this.mentionsVisible = true;
      this.mentionSearchQuery = atMatch[1].toLowerCase();
      this.filterMentions();
      this.cdr.detectChanges(); // Ensure UI reflects the change
    } else {
      this.mentionsVisible = false;
      this.cdr.detectChanges();
    }
  }

  private filterMentions(): void {
    this.filteredMentionList = this.mentionList.filter(m =>
      (m.fullName || m.name || '').toLowerCase().includes(this.mentionSearchQuery)
    );
    this.mentionSelectedIndex = 0;
  }

  insertMention(user: any): void {
    this.mentionsVisible = false;

    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      this.cdr.detectChanges();
      return;
    }

    const range = selection.getRangeAt(0);

    // Selection must be inside the editor
    if (!this.messageEditor?.nativeElement.contains(range.startContainer)) {
      this.messageEditor?.nativeElement.focus();
      this.cdr.detectChanges();
      return;
    }

    const textNode = range.startContainer;
    const offset = range.startOffset;

    if (textNode.nodeType !== Node.TEXT_NODE) {
      this.cdr.detectChanges();
      return;
    }

    const text = textNode.textContent || '';
    const atIndex = text.lastIndexOf('@', offset - 1);
    if (atIndex === -1) {
      this.cdr.detectChanges();
      return;
    }

    // 1. Remove the "@query" string that was being typed
    range.setStart(textNode, atIndex);
    range.setEnd(textNode, offset);
    range.deleteContents();

    // 2. Create the mention element
    const mentionSpan = document.createElement('span');
    mentionSpan.className = 'mention';
    mentionSpan.contentEditable = 'false';
    mentionSpan.setAttribute('data-user-id', user.userId || user.id || user.userId);
    mentionSpan.innerText = `@${user.fullName || user.name}`;

    // 3. Create a trailing space
    const spaceNode = document.createTextNode('\u00A0');

    // 4. Insert nodes
    range.insertNode(spaceNode);
    range.insertNode(mentionSpan);

    // 5. Move cursor after the space
    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // 6. Sync internal state
    this.suppressMentionCheck = true;
    this.onEditorInput({ target: this.messageEditor.nativeElement });
    setTimeout(() => {
      this.suppressMentionCheck = false;
      this.cdr.detectChanges();
    }, 100);

    this.cdr.detectChanges();
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // CALLING
  // ——————————————————————————————————————————————————————————————————————————————

  private setupCallSignals(): void {
    if (!this.currentUserId) return;
    // NOTE: Do NOT call callService.startConnection() here.
    // The global AppComponent manages the Call Hub connection lifecycle.
    // Calling it again here can cause the hub to re-register event listeners (duplicates)
    // and can disrupt the active connection that AppComponent established.

    // Track call hub connection state for local UI feedback only
    this.callService.connectionState$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.isCallHubConnected = state === signalR.HubConnectionState.Connected;
      this.callHubStatusMessage = state === signalR.HubConnectionState.Connected
        ? 'Connected'
        : state === signalR.HubConnectionState.Reconnecting
          ? 'Reconnecting... Please wait'
          : 'Connecting... Please wait';
      this.cdr.detectChanges();
    });

    // Callee accepted → open meeting window and reset outgoing state.
    this.callService.callAccepted$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      console.log('✅ Call accepted by remote user');
      this.resetOutgoingCallState();
      // Use the API-assigned room ID so both sides join the same LiveKit room.
      // Fall back to the derived room ID only when the server didn't return one.
      const roomId = data.roomId || (() => {
        const sorted = [this.currentUserId, data.byUserId].sort();
        return `call_${sorted[0]}_${sorted[1]}`;
      })();
      this.openMeetingWindow(roomId, true, true, this.callType === 'Video');
      this.cdr.detectChanges();
    });

    // Remote side rejected → reset outgoing state and inform user.
    this.callService.callRejected$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      console.log('❌ Call rejected by remote user', data.reason);
      this.resetOutgoingCallState();
      this.showAlert(`Call rejected: ${data.reason}`);
      this.cdr.detectChanges();
    });

    // Call ended by remote side (e.g. they hung up) → reset local state.
    this.callService.callEnded$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      console.log('📴 Call ended by remote user — resetting local outgoing state');
      this.resetOutgoingCallState();
      this.cdr.detectChanges();
    });
  }

  startCall(type: CallType): void {
    if (!this.selectedUser) return;
    if (this.selectedUser.isGroup) {
      this.startGroupCall(type);
      return;
    }

    // Use exact SignalR mapped ID (priority: oisMeetUserId, then db id)
    const targetUserId = this.selectedUser.oisMeetUserId || this.selectedUser.id;
    if (!targetUserId) return this.showAlert('Selected user is missing a valid call identity.');

    console.log(`🚀 Initiating ${type} call to user: ${this.selectedUser.fullName} (Target ID: ${targetUserId})`);
    this.callType = type;
    this.isCalling = true;
    this.activeCallUserId = targetUserId;
    this.activeCallUserName = this.selectedUser.fullName || this.selectedUser.name || 'participant';

    // Set the global outgoing call display (shown by app.component.ts banner).
    // Do NOT set a local duplicate timeout here — CallService handles the 60s timeout
    // on the callee side, and the global banner Cancel button handles caller cancellation.
    this.callService.setOutgoingCallDisplay(targetUserId, this.activeCallUserName, type);

    const name = this.sessionService.getFullName() || 'User';
    this.callService.startCall(targetUserId, this.activeCallUserName, name, type)
      .then(() => {
        console.log('✅ StartCall request sent to hub');
      })
      .catch(err => {
        console.error('❌ Failed to start call invocation:', err);
        this.callService.stopRingtones();
        this.resetOutgoingCallState();
        this.callService.outgoingCall.set(null);
        this.showAlert('Could not start call. Please ensure you are connected and try again.');
        this.cdr.detectChanges();
      });
  }

  private resetOutgoingCallState(): void {
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }

    this.isCalling = false;
    this.activeCallUserId = null;
    this.activeCallUserName = '';
  }



  private playCallRingtone(): void {
    // Ringtone logic
  }

  private stopCallRingtone(): void {
    // Stop logic
  }

  ngAfterViewChecked(): void {
    if (this._scrollToMessageIndex !== null) {
      const idx = this._scrollToMessageIndex;
      this._scrollToMessageIndex = null;
      this._scrollToFirstUnread(idx);
    }
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
    this.showConfirm('Are you sure you want to delete this message?', 'Delete', () => {

      this.store.dispatch(MessagesActions.deleteMessage({ messageId }));
    
});
  }

  editMessage(message: any): void {
    this.editingMessage = { ...message };
    // Preserve formatted HTML; plain text fallback
    this.editFormattedContent = message.formattedContent || message.content || '';
    const tmp = document.createElement('div');
    tmp.innerHTML = this.editFormattedContent;
    this.editContent = tmp.innerText || message.content || '';
    this.cdr.detectChanges();
    // Populate contenteditable and focus it after render
    setTimeout(() => {
      const el = this.editEditorRef?.nativeElement as HTMLElement;
      if (el) {
        el.innerHTML = this.editFormattedContent;
        el.focus();
        // Move cursor to end
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  }

  saveEdit(): void {
    const el = this.editEditorRef?.nativeElement as HTMLElement;
    const html = el ? el.innerHTML : this.editFormattedContent;
    const text = el ? el.innerText : this.editContent;
    if (!this.editingMessage || !text.trim()) return;
    this.store.dispatch(MessagesActions.editMessage({
      messageId: this.editingMessage.id,
      content: text.trim(),
      formattedContent: html
    }));
    this.editingMessage = null;
    this.editContent = '';
    this.editFormattedContent = '';
  }

  cancelEdit(): void {
    this.editingMessage = null;
    this.editContent = '';
    this.editFormattedContent = '';
  }

  onEditKeydown(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl) {
      switch (event.key.toLowerCase()) {
        case 'b': event.preventDefault(); this.formatEditDoc('bold'); return;
        case 'i': event.preventDefault(); this.formatEditDoc('italic'); return;
        case 'u': event.preventDefault(); this.formatEditDoc('underline'); return;
      }
    }

    if (event.key === 'Enter') {
      const editorEl = this.editEditorRef?.nativeElement as HTMLElement | undefined;
      const ctx = editorEl ? this.getCursorBlockContext(editorEl) : null;
      const syncEdit = () => {
        if (editorEl) {
          this.editFormattedContent = editorEl.innerHTML;
          this.editContent = editorEl.innerText;
        }
      };

      if (ctx === 'li') {
        setTimeout(syncEdit, 0);
        return;
      }
      if (ctx === 'blockquote' && !event.shiftKey) {
        setTimeout(syncEdit, 0);
        return;
      }
      if (ctx === 'pre' || ctx === 'code') {
        event.preventDefault();
        document.execCommand('insertText', false, '\n');
        setTimeout(syncEdit, 0);
        return;
      }
      if (event.shiftKey) {
        setTimeout(syncEdit, 0);
        return;
      }
      event.preventDefault();
      this.saveEdit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // FILE UPLOAD
  // ——————————————————————————————————————————————————————————————————————————————

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



  // ——————————————————————————————————————————————————————————————————————————————
  // COMPANY CHANGE
  // ——————————————————————————————————————————————————————————————————————————————

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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // USER LOADING
  // ══════════════════════════════════════════════════════════════════════════════════════

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
              userId: u.id?.toString(), // FIX: Use Guid Id as userId for consistent signaling and activities
              ssoUserId: u.ssoUserId || u.id?.toString(), // Preserve SsoUserId separately if needed
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

            // Merge with existing state to preserve conversationId / lastMessage / participants
            allUsers.forEach((newUser: any) => {
              const existing = this.users.find(u => u.id === newUser.id);
              if (existing) {
                newUser.conversationId = existing.conversationId;
                newUser.lastMessage = existing.lastMessage;
                newUser.lastMessageTime = existing.lastMessageTime;
                newUser.lastMessageAt = existing.lastMessageAt;
                newUser.unreadCount = existing.unreadCount;
                newUser.isGroup = existing.isGroup;
                newUser.participants = existing.participants; // FIX: Preserve participants for mentions
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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // SIGNALR EVENT SUBSCRIPTIONS
  // ══════════════════════════════════════════════════════════════════════════════════════

  private setupSignalREvents(): void {
    this.chatSignalrService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message: any) => { if (message) this.handleNewMessage(message); });

    this.chatSignalrService.userTyping$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        if (data && this.selectedUser?.userId === data.userId) {
          this.isTyping = data.isTyping;
          setTimeout(() => this.isTyping = false, 3000);
        }
      });

    this.chatSignalrService.messageStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => { if (data) this.updateMessageStatus(data.messageId, data.status); });

    this.chatSignalrService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msgId: string) => { if (msgId) this.deleteMessageFromUI(msgId); });

    this.chatSignalrService.newConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe((conv: any) => { if (conv) this.addNewConversation(conv); });

    this.chatSignalrService.memberAdded$
      .pipe(takeUntil(this.destroy$))
      .subscribe((convId: string) => {
        if (convId) {
          this.loadConversations();
          if (this.selectedConversation?.id === convId) {
            this.loadMessages(convId);
          }
        }
      });

    this.chatSignalrService.groupInfoUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
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
      .subscribe((onlineIds: string[]) => {
        this.users.forEach(u => {
          u.isOnline = onlineIds.map(id => id.toString()).includes(u.id?.toString());
        });
        this.cdr.detectChanges();
      });
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // INCOMING MESSAGE HANDLER
  // ══════════════════════════════════════════════════════════════════════════════════════

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
      this.showBrowserNotification(senderName, preview, conversationId); // Pass conversationId
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

    if (!convId && !sender) return null;

    return (
      this.users.find(u => u.conversationId?.toString() === convId) ||
      (sender && this.users.find(u =>
        u.id?.toString() === sender ||
        u.userId?.toString() === sender ||
        u.ssoUserId?.toString() === sender
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

  applySearch(): void {
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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════════════════════════

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


  private showBrowserNotification(title: string, body: string, conversationId?: string): void {
    // Only skip if app is visible, has focus, AND this is the current active conversation
    const isAppActive = document.visibilityState === 'visible' && document.hasFocus();
    const isCurrentConv = conversationId && this.selectedConversation?.id?.toString() === conversationId.toString();

    if (isAppActive && isCurrentConv) return;

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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS & MESSAGES
  // ══════════════════════════════════════════════════════════════════════════════════════

  loadConversations(): void {
    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res.success || !res.data) return;

          (res.data as any[]).forEach((conv: any) => {
            const isGroup = conv.conversationType === 'Group';
            const participants = conv.participants || [];
            const currentUserIdStr = this.currentUserId?.toString();

            // Find 'other' participant by checking both GUID and SSO ID
            const other = participants.find((p: any) => {
              const pid = p.userId?.toString();
              const pSsoId = p.ssoUserId?.toString();
              return pid !== currentUserIdStr && pSsoId !== currentUserIdStr;
            }) || (participants.length > 0 ? participants[0] : {});

            // Match against existing users list using both GUID and SSO ID
            const otherUserId = other.userId?.toString();
            const otherSsoId = other.ssoUserId?.toString() || other.userId?.toString();

            let user = isGroup
              ? this.users.find(u => u.conversationId === conv.id?.toString())
              : this.users.find(u =>
                (otherUserId && u.id?.toString() === otherUserId) ||
                (otherSsoId && u.ssoUserId?.toString() === otherSsoId)
              );

            if (user) {
              user.conversationId = conv.id?.toString();
              user.isGroup = isGroup;
              user.participants = participants;
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
                ssoUserId: isGroup ? null : (other.ssoUserId?.toString() || other.userId?.toString()),
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

          // ——————————————————————————————————————————————————————————————————————————————
          //    unreadCount > 0 for bold and badge in the template ——————————————————————
          this.totalUnreadCount = this.users.reduce(
            (s, u) => s + (u.unreadCount || 0), 0
          );
          this.users = [...this.users];
          this.updateTeamsList();
          this.sortUsersByLastMessage();
          this.applySearch();

          if (!this.selectedUser && this.viewMode() !== 'activity') {
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

    // Reset initial-load flag immediately so any stale pending load is ignored.
    this._initialLoadConvId = null;

    if (user.unreadCount > 0) {
      user.unreadCount = 0;
      this.totalUnreadCount = this.users.reduce((s, u) => s + (u.unreadCount || 0), 0);
      this.users = [...this.users];
    }

    if (user.conversationId) {
      this.selectedConversation = { id: user.conversationId };
      try {
        await this.chatSignalrService.joinConversation(user.conversationId);
        this._initialLoadConvId = user.conversationId;
        this.loadMessages(user.conversationId);

        // Load mention list for this conversation
        if (user.isGroup) {
          // Use participants list from the conversation object
          this.mentionList = (user.participants || [])
            .filter((p: any) => {
              const pid = p.userId?.toString();
              const pSsoId = p.ssoUserId?.toString();
              return pid !== this.currentUserId?.toString() && pSsoId !== this.currentUserId?.toString();
            })
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
                this._initialLoadConvId = convId;
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

    // Use current selectedUser (Team) to find participants
    const groupConv = this.selectedUser?.isGroup ? this.selectedUser :
      this.users.find(u => (u.name === this.activeTeam || u.fullName === this.activeTeam) && u.isGroup);

    if (groupConv && groupConv.conversationId) {
      this.selectedConversation = { id: groupConv.conversationId };
      this.loadMessages(groupConv.conversationId);

      this.mentionList = (groupConv.participants || [])
        .filter((p: any) => p.userId?.toString() !== this.currentUserId?.toString())
        .map((p: any) => ({
          id: p.userId?.toString(),
          userId: p.userId?.toString(),
          fullName: p.name || p.fullName,
          name: p.name || p.fullName,
          avatarColor: this.getMemberAvatarColor(p.name || p.fullName)
        }));
    } else {
      this.mentionList = [];
    }
  }

  openGroupInfo(): void {
    this.mainActiveTab = 'info';
    this.cdr.detectChanges();
  }

  private async handleNotificationSelection(recipient: NotificationRecipient) {
    const notification = recipient.notification;
    if (!notification) return;

    // Ensure we are in activity mode
    if (this.viewMode() !== 'activity') return;

    // Priority: conversationId > contextId > entityId (for message-type notifications)
    const convId = notification.conversationId || notification.contextId;
    const entityId = notification.entityId;

    let target = this.users.find(u =>
      (convId && (u.conversationId === convId || u.id === convId)) ||
      (entityId && (u.conversationId === entityId || u.id === entityId))
    );

    if (target) {
      this.viewMode.set('chat');
      await this.selectUser(target);
      this.mainActiveTab = 'chat';
      if (notification.entityType === 'Message' && entityId) {
        this.scrollToMessage(entityId);
      }
    } else if (notification.entityType === 'Meeting' && entityId) {
      // Navigate to meeting (join)
      this.viewMode.set('chat');
    }
  }

  private scrollToMessage(messageId: string) {
    setTimeout(() => {
      let attempts = 0;
      const interval = setInterval(() => {
        const element = document.getElementById(`msg-${messageId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'end' });
          element.classList.add('highlight-message');
          setTimeout(() => element.classList.remove('highlight-message'), 5000);
          clearInterval(interval);
        }
        if (++attempts > 20) clearInterval(interval);
      }, 500);
    }, 500);
  }


  getMemberAvatarColor(senderName: string): string {
    // Look up in users list or generate consistent color based on name
    const user = this.users.find(u => u.name === senderName || u.fullName === senderName);
    if (user?.avatarColor) return user.avatarColor;

    // Deterministic fallback color based on name to prevent ExpressionChangedAfterItHasBeenCheckedError
    const colors = ['#1a73e8', '#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#009688'];
    const hash = Array.from(senderName || 'U').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // ——————————————————————————————————————————————————————————————————————————————
  // MEETING LINK CLICK — FIX: validate then join as participant
  // ——————————————————————————————————————————————————————————————————————————————

  /**
   * FIX: calls validateMeeting API before opening the window so the
   * participant is properly registered. Shows a spinner-style snack
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

    this.showConfirm(
      `Join meeting?\n\nMeeting ID: ${meetingId}\n\nClick OK to join.`,
      'Join',
      () => {

    // Validate the meeting via API then open the window as participant
    this.validateAndJoinMeeting(meetingId);}
    );
  }

  /**
   * FIX for Issue 2:
   * Validates the meeting ID via API (same as the dialog does for join-meeting),
   * calls joinMeeting so the participant is registered server-side,
   * then opens the meeting window.
   */
  private async validateAndJoinMeeting(meetingId: string): Promise<void> {
    const userId = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      this.showAlert('User not authenticated. Please log in again.');
      return;
    }

    // Single-meeting guard
    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.isMeetingActive === 'function') {
      const isActive = await electronApi.isMeetingActive();
      if (isActive) {
        this.showAlert('You are already in an active meeting. Please leave it before joining another.');
        return;
      }
    }

    // Validate first
    this.meetingService.validateMeeting(meetingId).subscribe({
      next: (validateRes: any) => {
        if (!validateRes.success) {
          this.showAlert(validateRes.message || 'Invalid or expired meeting ID.');
          return;
        }

        // Register participant server-side
        this.meetingService.joinMeeting({ meetingId, userId, userName }).subscribe({
          next: (joinRes: any) => {
            if (joinRes.success) {
              this.openMeetingWindow(meetingId, false);
            } else {
              this.showAlert('Could not join meeting. Please try again.');
            }
          },
          error: () => this.showAlert('Failed to join meeting. Please try again.')
        });
      },
      error: () => this.showAlert('Could not validate meeting. Please try again.')
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


  // SEARCH

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
    const filtered = this.messages.filter(m => m.id?.toString() !== messageId?.toString());
    this.messages = this.decorateMessagesWithDates(filtered);
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

  loadUnreadCount(): void { }

  async startGroupCall(type: CallType): Promise<void> {
    if (!this.selectedUser?.isGroup || this.isGroupCallStarting) return;

    const hostId = this.currentUserId;
    const hostName = this.sessionService.getFullName() || 'User';
    if (!hostId) return;

    this.isGroupCallStarting = true;
    this.cdr.detectChanges();

    try {
      const res: any = await this.meetingService.createMeeting({
        topic: `${this.selectedUser.name || this.selectedUser.fullName || 'Group'} Call`,
        hostId,
        hostName,
        expiryHours: 2,
        settings: {
          muteOnEntry: false,
          allowChat: true,
          allowScreenShare: true,
          maxParticipants: 50
        }
      }).toPromise();

      if (!res?.success || !res?.data?.meetingId) {
        this.showAlert('Could not create group call. Please try again.');
        return;
      }

      const meetingId: string = res.data.meetingId;
      console.log(`🎯 Group call created — meetingId=${meetingId}`);

      // Open the meeting room for the host immediately.
      this.openMeetingWindow(meetingId, true, true, type === 'Video');

      // Invite every group participant (excluding self) via SignalR.
      const participants: any[] = this.selectedUser.participants || [];
      for (const p of participants) {
        const userId = p.userId?.toString();
        if (!userId || userId === hostId) continue;
        try {
          await this.signalRService.inviteToMeeting(userId, meetingId, hostName);
          console.log(`📨 Invited ${p.name || p.fullName || userId} to group call`);
        } catch (err) {
          console.error(`Failed to invite ${p.name || userId} to group call:`, err);
        }
      }
    } catch (err) {
      console.error('Failed to start group call:', err);
      this.showAlert('Could not start group call. Please try again.');
    } finally {
      this.isGroupCallStarting = false;
      this.cdr.detectChanges();
    }
  }

  // ——————————————————————————————————————————————————————————————————————————————
  // REACTIONS
  // ——————————————————————————————————————————————————————————————————————————————

  openReactionPicker(msgId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.activeReactionMsgId = this.activeReactionMsgId === msgId ? null : msgId;
    this.cdr.detectChanges();
  }

  closeReactionPicker(): void {
    this.activeReactionMsgId = null;
    this.cdr.detectChanges();
  }

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

  openPicker(context: 'compose' | 'edit', tab: PickerTab, event: MouseEvent): void {
    event.stopPropagation();
    const isOpen = this.isPickerVisible[context];

    // Close all pickers first
    this.isPickerVisible = { compose: false, edit: false };

    if (!isOpen) {
      this.pickerInitialTab = tab;

      // Calculate viewport-safe fixed position from the trigger button
      const btn = event.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const PICKER_WIDTH = 360;
      const PICKER_HEIGHT = 460;
      const MARGIN = 8;

      // Horizontal: prefer left-aligned with button, clamp to viewport
      let left = rect.left;
      if (left + PICKER_WIDTH > window.innerWidth - MARGIN) {
        left = window.innerWidth - PICKER_WIDTH - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;

      // Vertical: prefer opening upward; fall back to downward if not enough space
      const spaceAbove = rect.top - MARGIN;
      const top = spaceAbove >= PICKER_HEIGHT
        ? rect.top - PICKER_HEIGHT - MARGIN      // open upward
        : rect.bottom + MARGIN;                  // open downward

      this.pickerPosition = { top, left };
      this.isPickerVisible[context] = true;
    }

    this.cdr.detectChanges();
  }

  closePicker(context: 'compose' | 'edit'): void {
    this.isPickerVisible[context] = false;
    this.cdr.detectChanges();
  }

  onPickerEmojiSelect(emoji: string, context: 'compose' | 'edit'): void {
    if (context === 'compose') {
      this.addEmoji(emoji);
    } else {
      this.editContent += emoji;
    }
    this.isPickerVisible[context] = false;
    this.cdr.detectChanges();
  }

  onPickerStickerSelect(sticker: string, context: 'compose' | 'edit'): void {
    if (context === 'compose') {
      this.sendSticker(sticker);
    } else {
      this.saveEditAsSticker(sticker);
    }
    this.isPickerVisible[context] = false;
    this.cdr.detectChanges();
  }

  /** @deprecated kept for legacy inline emoji button in toolbar */
  showEmojiPicker(event: MouseEvent): void {
    this.openPicker('compose', 'emoji', event);
  }

  /** @deprecated kept for legacy sticker button */
  toggleStickerPicker(event: MouseEvent): void {
    this.openPicker('compose', 'sticker', event);
  }

  sendSticker(sticker: string): void {
    this.isPickerVisible.compose = false;
    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    // Send sticker as high-impact formatted HTML
    const stickerHtml = `<div class="msg-sticker" style="font-size: 5rem; cursor: default; line-height: 1.2;">${sticker}</div>`;

    this.store.dispatch(MessagesActions.sendMessage({
      conversationId,
      content: '[Sticker]',
      messageType: 'Text',
      formattedContent: stickerHtml,
      replyToMessageId: this.replyToMessage?.id
    }));

    this.replyToMessage = null;
    this.cdr.detectChanges();
  }

  saveEditAsSticker(sticker: string): void {
    if (!this.editingMessage) return;
    this.isPickerVisible.edit = false;
    const stickerHtml = `<div class="msg-sticker" style="font-size: 5rem; cursor: default; line-height: 1.2;">${sticker}</div>`;
    this.store.dispatch(MessagesActions.editMessage({
      messageId: this.editingMessage.id,
      content: '[Sticker]',
      formattedContent: stickerHtml
    }));
    this.editingMessage = null;
    this.editContent = '';
    this.cdr.detectChanges();
  }

  @HostListener('document:selectionchange')
  onSelectionChange(): void {
    // Update toolbar active states whenever selection moves inside the editor
    if (this.messageEditor?.nativeElement.contains(window.getSelection()?.anchorNode)) {
      this.updateFormatState();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Handle mention popup
    if (this.mentionsVisible) {
      const isInsideEditor = this.messageEditor?.nativeElement.contains(target);
      const isInsidePopover = target.closest('.mention-popover');

      if (!isInsideEditor && !isInsidePopover) {
        this.mentionsVisible = false;
        this.cdr.detectChanges();
      }
    }

    // Handle unified emoji/sticker picker popup
    if (this.isPickerVisible.compose) {
      const inside = target.closest('.picker-anchor--compose') || target.closest('app-emoji-sticker-picker');
      if (!inside) {
        this.isPickerVisible.compose = false;
        this.cdr.detectChanges();
      }
    }
    if (this.isPickerVisible.edit) {
      const inside = target.closest('.picker-anchor--edit') || target.closest('app-emoji-sticker-picker');
      if (!inside) {
        this.isPickerVisible.edit = false;
        this.cdr.detectChanges();
      }
    }

    // Close per-message reaction picker on outside click
    if (this.activeReactionMsgId) {
      const insidePicker = target.closest('.msg-emoji-picker') || target.closest('.react-btn');
      if (!insidePicker) {
        this.activeReactionMsgId = null;
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
    this.isPickerVisible.compose = false;
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

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

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

    return d.toLocaleDateString(undefined, {
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
      month: "long",
      day: "numeric"
    });
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
      this.chatMessagesContainer.nativeElement.scrollTop = this.chatMessagesContainer.nativeElement.scrollHeight + 60;
    } catch (err) { }
  }

  private _scrollToFirstUnread(index: number): void {
    const msg = this.messages[index];
    if (!msg) { this.scrollToBottom(); return; }
    const id = msg.id || msg.Id;
    if (!id) { this.scrollToBottom(); return; }
    try {
      const el = document.getElementById('msg-' + id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
      } else {
        this.scrollToBottom();
      }
    } catch { this.scrollToBottom(); }
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
        this.showAlert('Failed to update group name. Please try again.');
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
      this.showAlert('Please select a valid image (JPG, PNG, or WEBP)');
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showAlert('Image too large. Max size is 5MB.');
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
        this.showAlert('Failed to upload avatar. Please try again.');
      }
    });
  }

  private saveGroupAvatar(avatarUrl: string): void {
    const conversationId = this.selectedConversation?.id;
    if (!conversationId) return;

    this.chatService.updateGroupInfo(conversationId, undefined, avatarUrl).subscribe({
      next: (res: any) => {
        if (res.success) {
          if (this.selectedUser) {
            this.selectedUser.avatarUrl = avatarUrl;
          }
          this.cdr?.detectChanges();
        }
      },
      error: (err: any) => {
        console.error('Failed to update group avatar:', err);
      }
    });
  }

}
