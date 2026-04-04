import {
  Component, OnInit, ChangeDetectorRef, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Subject, takeUntil, forkJoin, map } from 'rxjs';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityDto, NotificationDto } from '../../core/models/collaboration.models';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';
import { ChatSignalrService } from '../../core/services/chat-signalr.service';
import { FileService } from '../../core/services/file.service';
import { SettingsService, UserSettings } from '../../core/services/settings.service';

interface ExtendedActivity extends ActivityDto {
  isRead: boolean;
  avatarLetter: string;
  avatarColor: string;
  senderName: string;
  category: 'mention' | 'reply' | 'reaction' | 'missed-call' | 'update' | 'message' | 'file';
  timeLabel: string;
  entityName?: string;
  chatId?: string;
  messageId?: string;
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, SafeHtmlPipe],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss'
})
export class ActivityFeedComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadContainer') private threadContainerRef!: ElementRef;
  @ViewChild('replyEditor') private replyEditorRef!: ElementRef;

  // ─── Activity Feed State ─────────────────────────────────────────────────
  items: ExtendedActivity[] = [];
  filteredItems: ExtendedActivity[] = [];
  selectedActivity: ExtendedActivity | null = null;
  loading = true;
  activeFilter: string = 'All';

  // ─── Message Thread State ────────────────────────────────────────────────
  contextMessages: any[] = [];
  loadingContext = false;
  currentPage = 1;
  pageSize = 25;
  hasMoreContext = true;
  highlightedMessageId: string | null = null;
  private highlightTimeout: any;
  private shouldScrollToBottom = false;
  private shouldScrollToHighlight = false;

  // ─── Reply / Send State ──────────────────────────────────────────────────
  replyText = '';
  formattedReplyText = '';
  replyToMessage: any = null;
  isSendingReply = false;
  isUploadingFile = false;
  isEmojiPickerOpen = false;
  commonEmojis = ['👍', '❤️', '😄', '😮', '😢', '🔥', '👏', '✅', '🎉', '🤔'];

  // ─── Context Action State ────────────────────────────────────────────────
  activeTab: 'chat' | 'shared' = 'chat';
  sharedFiles: any[] = [];
  activeMessageMenu: string | null = null;

  // ─── Settings & Misc ─────────────────────────────────────────────────────
  private destroy$ = new Subject<void>();
  settings: UserSettings = { showMessagePreview: true, showMediaPreviews: true, notificationsMentionsOnly: false };
  private chatCache = new Map<string, any[]>();

  filters = ['All', 'Unread', 'Mentions'];

  constructor(
    public readonly collaboration: CollaborationService,
    public readonly chatService: ChatService,
    public readonly session: SessionService,
    private readonly fileService: FileService,
    private readonly cdr: ChangeDetectorRef,
    private readonly chatSignalr: ChatSignalrService,
    private readonly settingsService: SettingsService
  ) { }

  ngOnInit(): void {
    this.settingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(s => {
      this.settings = s;
      this.cdr.detectChanges();
    });
    this.loadActivities();
    this.setupRealTimeUpdates();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.doScrollToBottom();
      this.shouldScrollToBottom = false;
    }
    if (this.shouldScrollToHighlight && this.highlightedMessageId) {
      const el = document.getElementById(`act-msg-${this.highlightedMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.shouldScrollToHighlight = false;
      }
    }
  }

  ngOnDestroy(): void {
    if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── ACTIVITY LOADING ────────────────────────────────────────────────────

  loadActivities(): void {
    this.loading = true;

    forkJoin({
      activities: this.collaboration.getActivity(50),
      notifications: this.collaboration.getNotifications()
    }).pipe(
      takeUntil(this.destroy$),
      map(res => {
        const activities = (res.activities.data ?? []).map((a: any) => this.mapToExtended(a));
        const notifications = (res.notifications.data ?? []).map((n: any) => this.mapToExtended(n));

        const combined = [...notifications];
        activities.forEach(act => {
          if (!combined.some(c => c.id === act.id || (c.entityId === act.entityId && c.createdAt === act.createdAt))) {
            combined.push(act);
          }
        });

        return combined.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
    ).subscribe({
      next: (combined) => {
        this.items = combined;
        this.applyFilter(this.activeFilter);
        this.loading = false;

        if (this.filteredItems.length > 0 && !this.selectedActivity) {
          this.selectActivity(this.filteredItems[0]);
        }

        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private setupRealTimeUpdates(): void {
    this.chatSignalr.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msg => {
        if (!msg) return;

        // Push new message to thread if it matches the active conversation
        const convId = msg.conversationId?.toString();
        if (convId && this.selectedActivity?.chatId === convId) {
          this.contextMessages = [...this.contextMessages, msg];
          this.shouldScrollToBottom = true;
          this.cdr.detectChanges();
        }

        // Also create a new activity item
        const newActivity = this.mapToExtended({
          id: msg.id || Math.random().toString(),
          userId: msg.senderId || '',
          title: `${msg.senderName} messaged you`,
          body: msg.content || 'Sent a message',
          activityType: 'message',
          createdAt: msg.sentAt || new Date().toISOString(),
          entityType: 'Conversation',
          entityId: convId || ''
        } as any);

        this.items = [newActivity, ...this.items];
        this.applyFilter(this.activeFilter);
        this.cdr.detectChanges();
      });
  }

  // ─── MAPPING ─────────────────────────────────────────────────────────────

  private mapToExtended(item: ActivityDto | NotificationDto): ExtendedActivity {
    const titleLower = (item.title || '').toLowerCase();
    const bodyLower = (item.body || '').toLowerCase();
    const type = (item as any).type || (item as any).activityType || '';

    const isMention = titleLower.includes('mentioned') || type === 'Mention';
    const isReply = titleLower.includes('replied') || type === 'Reply';
    const isReaction = titleLower.includes('reacted') || type === 'Reaction';
    const isCall = titleLower.includes('call') || type === 'Call';
    const isFile = ['.json', '.png', '.xlsx', '.pdf', '.jpg', '.doc', '.zip'].some(ext =>
      bodyLower.includes(ext) || titleLower.includes(ext)
    ) || type === 'File';

    let category: ExtendedActivity['category'] = 'message';
    if (isMention) category = 'mention';
    else if (isReply) category = 'reply';
    else if (isReaction) category = 'reaction';
    else if (isCall) category = 'missed-call';
    else if (isFile) category = 'file';

    const words = (item.title || '').split(' ');
    let senderName = words[0] || 'System';
    if (isFile || titleLower.startsWith('new') || titleLower.startsWith('system')) {
      senderName = 'System';
    }

    // Resolve chatId from multiple possible sources
    const chatId = item.entityType === 'Conversation' ? item.entityId
      : (item as any).chatId
      || (item as any).conversationId
      || undefined;

    const messageId = item.entityType === 'Message' ? item.entityId
      : (item as any).messageId
      || undefined;

    return {
      ...item,
      isRead: (item as any).isRead ?? false,
      avatarLetter: senderName.charAt(0).toUpperCase(),
      avatarColor: this.getFixedColor(senderName),
      senderName,
      category,
      timeLabel: this.formatTime(item.createdAt),
      entityName: item.entityType === 'Channel' ? (item.entityId || undefined) : undefined,
      chatId,
      messageId
    };
  }

  // ─── FILTER ──────────────────────────────────────────────────────────────

  applyFilter(filter: string): void {
    this.activeFilter = filter;
    switch (filter) {
      case 'Unread':
        this.filteredItems = this.items.filter(i => !i.isRead);
        break;
      case 'Mentions':
        this.filteredItems = this.items.filter(i => i.category === 'mention');
        break;
      default:
        this.filteredItems = [...this.items];
        break;
    }
  }

  // ─── ACTIVITY SELECTION ──────────────────────────────────────────────────

  selectActivity(item: ExtendedActivity): void {
    if (this.selectedActivity?.id === item.id) return;

    this.selectedActivity = item;
    this.contextMessages = [];
    this.replyToMessage = null;
    this.sharedFiles = [];

    this.highlightedMessageId = item.messageId
      || (item.entityType === 'Message' ? item.entityId || null : null);

    if (!item.isRead) {
      item.isRead = true;
      this.collaboration.markNotificationsRead([item.id]).subscribe();
    }

    this.currentPage = 1;
    this.hasMoreContext = true;
    this.loadContext(item);
    this.cdr.detectChanges();
  }

  // ─── CONTEXT LOADING ─────────────────────────────────────────────────────

  private loadContext(item: ExtendedActivity, append = false): void {
    const chatId = this.resolveChatId(item);
    if (!chatId) {
      this.loadingContext = false;
      this.cdr.detectChanges();
      return;
    }

    // Check cache for first page
    if (!append && this.chatCache.has(chatId)) {
      this.contextMessages = this.chatCache.get(chatId)!;
      this.shouldScrollToBottom = !this.highlightedMessageId;
      this.shouldScrollToHighlight = !!this.highlightedMessageId;
      this.cdr.detectChanges();
      return;
    }

    this.loadingContext = true;
    this.chatService.getMessages(chatId, this.currentPage, this.pageSize).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const newMsgs = (res.data.messages || res.data) as any[];
          if (append) {
            this.contextMessages = [...newMsgs, ...this.contextMessages];
          } else {
            this.contextMessages = newMsgs;
            // Populate shared files
            this.sharedFiles = newMsgs.filter((m: any) =>
              m.messageType === 'File' || m.MessageType === 'File' || m.fileUrl || m.FileUrl
            );
            // Cache
            this.chatCache.set(chatId, newMsgs);
            this.shouldScrollToBottom = !this.highlightedMessageId;
            this.shouldScrollToHighlight = !!this.highlightedMessageId;
          }
          this.hasMoreContext = newMsgs.length === this.pageSize;
        } else {
          if (!append) this.contextMessages = [];
          this.hasMoreContext = false;
        }
        this.loadingContext = false;
        this.cdr.detectChanges();

        // Fade highlight after 3s
        if (this.highlightedMessageId) {
          if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
          this.highlightTimeout = setTimeout(() => {
            this.highlightedMessageId = null;
            this.cdr.detectChanges();
          }, 3500);
        }
      },
      error: () => {
        this.loadingContext = false;
        if (!append) this.contextMessages = [];
        this.cdr.detectChanges();
      }
    });
  }

  private resolveChatId(item: ExtendedActivity): string | null {
    if (item.chatId && this.isGuid(item.chatId)) return item.chatId;
    if (item.entityId && this.isGuid(item.entityId)) return item.entityId;
    return null;
  }

  onThreadScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollTop <= 50 && this.hasMoreContext && !this.loadingContext && this.selectedActivity) {
      this.currentPage++;
      this.loadContext(this.selectedActivity, true);
    }
  }

  // ─── SEND / REPLY ────────────────────────────────────────────────────────

  onReplyEditorInput(event: Event): void {
    const target = event.target as HTMLElement;
    this.formattedReplyText = target.innerHTML;
    this.replyText = target.innerText;
  }

  onReplyEditorKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendReply();
    }
  }

  sendReply(fileUrl?: string, fileName?: string): void {
    const content = this.replyText?.trim();
    if (!content && !fileUrl) return;
    if (!this.selectedActivity) return;

    const chatId = this.resolveChatId(this.selectedActivity);
    if (!chatId) return;

    this.isSendingReply = true;
    const msgType = fileUrl ? 'File' : 'Text';

    this.chatService.sendMessageApi(
      chatId, content || '', msgType,
      fileUrl, fileName, this.replyToMessage?.id,
      this.formattedReplyText
    ).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const sentMsg = res.data;
          sentMsg.senderId = this.session.getOISMeetUserId();
          sentMsg.senderName = this.session.getFullName() || 'You';
          sentMsg.sentAt = sentMsg.sentAt || new Date().toISOString();
          this.contextMessages = [...this.contextMessages, sentMsg];
          this.chatCache.set(chatId, this.contextMessages);
          this.shouldScrollToBottom = true;
        }
        this.isSendingReply = false;
        this.replyToMessage = null;
        this.formattedReplyText = '';
        this.replyText = '';
        if (this.replyEditorRef) {
          this.replyEditorRef.nativeElement.innerHTML = '';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSendingReply = false;
        this.cdr.detectChanges();
      }
    });
  }

  setReplyTo(msg: any): void {
    this.replyToMessage = msg;
    setTimeout(() => this.replyEditorRef?.nativeElement.focus(), 50);
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  // ─── REACTIONS ───────────────────────────────────────────────────────────

  toggleReaction(msg: any, emoji: string): void {
    const chatId = this.resolveChatId(this.selectedActivity!);
    if (!chatId) return;
    const hasReacted = this.hasReacted(msg, emoji);
    const call$ = hasReacted
      ? this.chatService.removeReaction(msg.id, emoji)
      : this.chatService.addReaction(msg.id, emoji);

    call$.subscribe(() => {
      if (!msg.reactions) msg.reactions = [];
      if (hasReacted) {
        const idx = msg.reactions.findIndex((r: any) => r.emoji === emoji && r.userId === this.session.getOISMeetUserId());
        if (idx > -1) msg.reactions.splice(idx, 1);
      } else {
        msg.reactions.push({ emoji, userId: this.session.getOISMeetUserId() });
      }
      this.cdr.detectChanges();
    });
  }

  hasReacted(msg: any, emoji: string): boolean {
    return (msg.reactions || []).some((r: any) =>
      r.emoji === emoji && r.userId?.toString() === this.session.getOISMeetUserId()?.toString()
    );
  }

  getReactionCount(msg: any, emoji: string): number {
    return (msg.reactions || []).filter((r: any) => r.emoji === emoji).length;
  }

  getReactedEmojis(msg: any): string[] {
    const map = new Map<string, number>();
    (msg.reactions || []).forEach((r: any) => map.set(r.emoji, (map.get(r.emoji) || 0) + 1));
    return Array.from(map.keys());
  }

  // ─── FILE UPLOAD ─────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploadingFile = true;
    this.fileService.uploadFile(file).subscribe({
      next: (evt: any) => {
        if (evt.type === 4) {
          const res = evt.body;
          if (res?.success && res.data) {
            this.sendReply(res.data.url, res.data.fileName);
          }
          this.isUploadingFile = false;
        }
      },
      error: () => {
        this.isUploadingFile = false;
        this.cdr.detectChanges();
      }
    });
  }

  formatDoc(command: string, value?: string): void {
    document.execCommand(command, false, value || '');
    this.replyEditorRef?.nativeElement.focus();
  }

  // ─── FILE ACTION ─────────────────────────────────────────────────────────

  handleFileAction(action: 'open' | 'download'): void {
    if (!this.selectedActivity?.body) return;
    const fileUrl = (this.selectedActivity as any).fileUrl || '';
    const fileName = this.selectedActivity.body || 'file';
    if (action === 'download' && fileUrl) {
      this.fileService.downloadFile(fileUrl, fileName);
    }
  }

  downloadAttachment(fileUrl: string, fileName: string): void {
    this.fileService.downloadFile(fileUrl, fileName);
  }

  getFileFullUrl(url: string): string {
    return this.fileService.getFileUrl(url);
  }

  // ─── SCROLL ──────────────────────────────────────────────────────────────

  private doScrollToBottom(): void {
    const el = this.threadContainerRef?.nativeElement as HTMLElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  public getFixedColor(seed: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  isCurrentUser(msg: any): boolean {
    return msg.senderId?.toString() === this.session.getOISMeetUserId()?.toString();
  }

  getMessageText(msg: any): string {
    return msg.formattedContent || msg.content || msg.Content || '';
  }

  getAttachments(msg: any): any[] {
    return msg.attachments || msg.Attachments || [];
  }

  isImageType(fileName: string): boolean {
    return /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName || '');
  }

  getFileIcon(fileName: string, fileType?: string): string {
    const name = (fileName || fileType || '').toLowerCase();
    if (/\.(pdf)$/.test(name)) return 'bi-file-earmark-pdf-fill text-danger';
    if (/\.(xls|xlsx|csv)$/.test(name)) return 'bi-file-earmark-spreadsheet-fill text-success';
    if (/\.(ppt|pptx)$/.test(name)) return 'bi-file-earmark-ppt-fill text-warning';
    if (/\.(doc|docx)$/.test(name)) return 'bi-file-earmark-word-fill text-primary';
    if (/\.(zip|rar|7z)$/.test(name)) return 'bi-file-earmark-zip-fill text-secondary';
    if (/\.(png|jpg|jpeg|gif|webp)$/.test(name)) return 'bi-file-earmark-image-fill text-info';
    return 'bi-file-earmark-fill';
  }

  private isGuid(val: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  private formatTime(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } catch { return ''; }
  }

  getCategoryIcon(category: string): string {
    switch (category) {
      case 'mention': return 'bi-at';
      case 'reply': return 'bi-reply-fill';
      case 'reaction': return 'bi-hand-thumbs-up-fill text-warning';
      case 'missed-call': return 'bi-telephone-x-fill text-danger';
      case 'file': return 'bi-file-earmark-fill text-info';
      case 'update': return 'bi-megaphone';
      default: return 'bi-chat-left-text';
    }
  }

  getActivityTypeText(item: ExtendedActivity): string {
    switch (item.category) {
      case 'mention': return 'mentioned you';
      case 'reply': return 'replied to your message';
      case 'reaction': return 'reacted to your message';
      case 'missed-call': return 'missed a call with you';
      case 'file': return 'shared a file';
      default: return 'posted a new message';
    }
  }

  getDisplayTitle(item: ExtendedActivity): string {
    if (item.entityName) return item.entityName;
    if (item.category === 'missed-call') return 'Missed Call';
    if (item.category === 'file') return item.body || 'Shared File';
    return `${item.senderName}`;
  }

  getDisplaySubtitle(item: ExtendedActivity): string {
    return this.getActivityTypeText(item);
  }

  getDisplayIcon(item: ExtendedActivity): string {
    if (item.entityType === 'Channel') return 'bi-hash';
    if (item.entityType === 'Conversation') return 'bi-chat-dots-fill';
    switch (item.category) {
      case 'missed-call': return 'bi-telephone-x-fill';
      case 'file': return 'bi-file-earmark-fill';
      case 'mention': return 'bi-at';
      default: return 'bi-chat-dots-fill';
    }
  }

  get unreadCount(): number {
    return this.items.filter(i => !i.isRead).length;
  }

  setActiveTab(tab: 'chat' | 'shared'): void {
    this.activeTab = tab;
  }

  toggleMessageMenu(msgId: string): void {
    this.activeMessageMenu = this.activeMessageMenu === msgId ? null : msgId;
  }

  toggleEmojiPicker(): void {
    this.isEmojiPickerOpen = !this.isEmojiPickerOpen;
  }

  insertEmoji(emoji: string): void {
    const editor = this.replyEditorRef?.nativeElement as HTMLElement;
    if (editor) {
      document.execCommand('insertText', false, emoji);
      this.onReplyEditorInput({ target: editor } as any);
    }
    this.isEmojiPickerOpen = false;
  }
}
