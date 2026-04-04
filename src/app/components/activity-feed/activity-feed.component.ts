import {
  Component, OnInit, ChangeDetectorRef, OnDestroy,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Subject, takeUntil, forkJoin, map, of } from 'rxjs';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { UserService } from '../../core/services/user.service';
import { ActivityDto, NotificationDto } from '../../core/models/collaboration.models';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';
import { ChatSignalrService } from '../../core/services/chat-signalr.service';
import { FileService } from '../../core/services/file.service';
import { SettingsService, UserSettings } from '../../core/services/settings.service';

// Sub-components
import { ActivityListComponent } from './activity-list/activity-list.component';
import { ActivityDetailComponent } from './activity-detail/activity-detail.component';

export interface ExtendedActivity extends ActivityDto {
  isRead: boolean;
  avatarLetter: string;
  avatarColor: string;
  senderName: string;
  category: 'mention' | 'reply' | 'reaction' | 'missed-call' | 'update' | 'message' | 'file' | 'meeting';
  timeLabel: string;
  entityName?: string;
  chatId?: string;
  messageId?: string;
}

@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    HttpClientModule, 
    ActivityListComponent,
    ActivityDetailComponent
  ],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss'
})
export class ActivityFeedComponent implements OnInit, OnDestroy {
  @ViewChild(ActivityDetailComponent) detailComponent!: ActivityDetailComponent;

  // ─── Activity Feed State ─────────────────────────────────────────────────
  items: ExtendedActivity[] = [];
  filteredItems: ExtendedActivity[] = [];
  selectedActivity: ExtendedActivity | null = null;
  loading = true;
  activeFilter: string = 'All';

  // ─── User Cache ──────────────────────────────────────────────────────────
  private usersMap = new Map<string, any>();

  // ─── Message Thread State ────────────────────────────────────────────────
  contextMessages: any[] = [];
  loadingContext = false;
  currentPage = 1;
  pageSize = 25;
  hasMoreContext = true;
  highlightedMessageId: string | null = null;
  private highlightTimeout: any;

  // ─── Reply / Send State ──────────────────────────────────────────────────
  replyToMessage: any = null;
  isSendingReply = false;
  isUploadingFile = false;

  // ─── Context Action State ────────────────────────────────────────────────
  sharedFiles: any[] = [];

  // ─── Settings & Misc ─────────────────────────────────────────────────────
  private destroy$ = new Subject<void>();
  settings: UserSettings = { showMessagePreview: true, showMediaPreviews: true, notificationsMentionsOnly: false };
  private chatCache = new Map<string, any[]>();

  constructor(
    public readonly collaboration: CollaborationService,
    public readonly chatService: ChatService,
    public readonly userService: UserService,
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

  ngOnDestroy(): void {
    if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── ACTIVITY LOADING ────────────────────────────────────────────────────

  loadActivities(): void {
    this.loading = true;

    // First fetch users if not done, then activities
    const clientId = this.session.getClientId();
    const companyId = this.session.getCompanyId();
    const appId = this.session.getMeetAppId();

    const users$ = (clientId && companyId && appId) 
      ? this.userService.getOisMeetUsers(clientId, companyId.toString(), appId)
      : of({ success: false, data: [] });

    forkJoin({
      activities: this.collaboration.getActivity(50),
      notifications: this.collaboration.getNotifications(),
      users: users$
    }).pipe(
      takeUntil(this.destroy$),
      map(res => {
        // Cache users
        if (res.users?.success && res.users.data) {
          res.users.data.forEach((u: any) => this.usersMap.set(u.id, u));
        }

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

        const convId = msg.conversationId?.toString();
        
        // Map message to activity
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

        // If it's for currently selected chat, update context
        if (convId && this.selectedActivity?.chatId === convId) {
           this.contextMessages = [...this.contextMessages, msg];
           if (this.detailComponent) this.detailComponent.forceScroll();
        }

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
    const isMeeting = titleLower.includes('meeting') || type === 'Meeting';
    const isFile = ['.json', '.png', '.xlsx', '.pdf', '.jpg', '.doc', '.zip'].some(ext =>
      bodyLower.includes(ext) || titleLower.includes(ext)
    ) || type === 'File' || type === 'file_uploaded';

    let category: ExtendedActivity['category'] = 'message';
    if (isMention) category = 'mention';
    else if (isReply) category = 'reply';
    else if (isReaction) category = 'reaction';
    else if (isCall) category = 'missed-call';
    else if (isMeeting) category = 'meeting';
    else if (isFile) category = 'file';

    // Get Sender Name from Cache or Heuristic
    let senderName = 'System';
    if (item.userId && this.usersMap.has(item.userId)) {
      senderName = this.usersMap.get(item.userId).fullName;
    } else {
      const words = (item.title || '').split(' ');
      senderName = words[0] || 'System';
      if (isFile || titleLower.startsWith('new') || titleLower.startsWith('system')) {
        senderName = 'System';
      }
    }

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

  loadContext(item: ExtendedActivity, append = false): void {
    const chatId = this.resolveChatId(item);
    if (!chatId) {
      this.loadingContext = false;
      this.cdr.detectChanges();
      return;
    }

    if (!append && this.chatCache.has(chatId)) {
      this.contextMessages = this.chatCache.get(chatId)!;
      if (this.detailComponent) this.detailComponent.forceScroll();
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
            this.sharedFiles = newMsgs.filter((m: any) =>
              m.messageType === 'File' || m.MessageType === 'File' || m.fileUrl || m.FileUrl
            );
            this.chatCache.set(chatId, newMsgs);
            if (this.detailComponent) this.detailComponent.forceScroll();
          }
          this.hasMoreContext = newMsgs.length === this.pageSize;
        } else {
          if (!append) this.contextMessages = [];
          this.hasMoreContext = false;
        }
        this.loadingContext = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingContext = false;
        this.cdr.detectChanges();
      }
    });
  }

  private resolveChatId(item: ExtendedActivity): string | null {
    if (item.chatId && this.isGuid(item.chatId)) return item.chatId;
    if (item.entityId && this.isGuid(item.entityId)) return item.entityId;
    return null;
  }

  // ─── SEND / REPLY ────────────────────────────────────────────────────────

  handleSendReply(data: { text: string, html: string }): void {
    if (!this.selectedActivity) return;
    const chatId = this.resolveChatId(this.selectedActivity);
    if (!chatId) return;

    this.isSendingReply = true;
    this.chatService.sendMessageApi(
      chatId, data.text || '', 'Text',
      undefined, undefined, this.replyToMessage?.id,
      data.html
    ).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const sentMsg = res.data;
          sentMsg.senderId = this.session.getOISMeetUserId();
          sentMsg.senderName = this.session.getFullName() || 'You';
          sentMsg.sentAt = sentMsg.sentAt || new Date().toISOString();
          this.contextMessages = [...this.contextMessages, sentMsg];
          this.chatCache.set(chatId, this.contextMessages);
          if (this.detailComponent) this.detailComponent.forceScroll();
        }
        this.isSendingReply = false;
        this.replyToMessage = null;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSendingReply = false;
        this.cdr.detectChanges();
      }
    });
  }

  handleFileSelect(file: File): void {
    if (!this.selectedActivity) return;
    const chatId = this.resolveChatId(this.selectedActivity);
    if (!chatId) return;

    this.isUploadingFile = true;
    this.fileService.uploadFile(file).subscribe({
      next: (evt: any) => {
        if (evt.type === 4 && evt.body?.success) {
           const res = evt.body.data;
           this.chatService.sendMessageApi(chatId, res.fileName, 'File', res.url, res.fileName).subscribe(r => {
             if (r.success) {
               this.contextMessages = [...this.contextMessages, r.data];
               if (this.detailComponent) this.detailComponent.forceScroll();
             }
             this.isUploadingFile = false;
             this.cdr.detectChanges();
           });
        }
      },
      error: () => {
        this.isUploadingFile = false;
        this.cdr.detectChanges();
      }
    });
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

  get unreadCount(): number {
    return this.items.filter(i => !i.isRead).length;
  }
}
