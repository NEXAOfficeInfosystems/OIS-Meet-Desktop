import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Notification, NotificationRecipient, NotificationType } from '../models/notification.models';
import { NotificationSignalrService } from './notification-signalr.service';
import { CollaborationRealtimeService } from './collaboration-realtime.service';
import { ChatSignalrService } from './chat-signalr.service';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private signalr = inject(NotificationSignalrService);
  private realtime = inject(CollaborationRealtimeService);
  private chatSignalr = inject(ChatSignalrService);
  private session = inject(SessionService);
  private apiUrl = `${environment.apiBaseUrl}/notifications`;

  // ── State ──────────────────────────────────────────────────────────────────
  notifications = signal<NotificationRecipient[]>([]);
  selectedNotification = signal<NotificationRecipient | null>(null);
  unreadCount = signal<number>(0);
  activeFilter = signal<'all' | 'unread' | 'mentions' | 'missed'>('all');
  isLoading = signal<boolean>(false);
  page = signal<number>(1);
  hasMore = signal<boolean>(true);

  constructor() {
    // ── Hub: backend-pushed NotificationRecipient (dedicated notifications hub) ──
    this.signalr.newNotification$.subscribe(recipient => {
      this._prependIfNew(recipient);
    });

    this.signalr.unreadCount$.subscribe(count => {
      this.unreadCount.set(count);
    });

    // ── Hub: collaboration hub NotificationDto → convert & prepend ───────────
    this.realtime.notificationReceived$
      .pipe(filter(Boolean))
      .subscribe(dto => {
        const recipient = this._dtoToRecipient(dto);
        this._prependIfNew(recipient);
      });

    // ── Chat SignalR: @mention detection ─────────────────────────────────────
    this.chatSignalr.messageReceived$
      .pipe(filter(Boolean))
      .subscribe(msg => this._handleIncomingMessage(msg));

    // ── Chat SignalR: reaction events ─────────────────────────────────────────
    this.chatSignalr.reactionAdded$
      .pipe(filter(Boolean))
      .subscribe(reaction => this._handleReaction(reaction));

    // ── Chat SignalR: generic activity events ─────────────────────────────────
    this.chatSignalr.newActivity$
      .pipe(filter(Boolean))
      .subscribe(activity => this._handleActivity(activity));

    // ── Start notifications hub immediately if userId is available ────────────
    const userId = this.session.getOISMeetUserId();
    if (userId) {
      this.signalr.startConnection(userId);
    }

    // ── Electron: start hub after async auth restore ──────────────────────────
    if (typeof window !== 'undefined') {
      window.addEventListener('auth-restored', () => {
        const restored = this.session.getOISMeetUserId();
        if (restored) {
          this.signalr.startConnection(restored);
          this.loadInitial();
        }
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  loadInitial() {
    this.page.set(1);
    this.hasMore.set(true);
    this._fetchNotifications(true);
    this._fetchUnreadCount();
  }

  loadMore() {
    if (this.isLoading() || !this.hasMore()) return;
    this.page.update(p => p + 1);
    this._fetchNotifications();
  }

  setFilter(filter: 'all' | 'unread' | 'mentions' | 'missed') {
    this.activeFilter.set(filter);
    this.loadInitial();
  }

  markAsRead(recipientIds: string[]) {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    this.notifications.update(prev =>
      prev.map(n => recipientIds.includes(n.id) ? { ...n, isRead: true } : n)
    );
    this.unreadCount.update(c => Math.max(0, c - recipientIds.length));

    const markReadParams = new HttpParams().set('userId', userId);
    this.http.post(`${this.apiUrl}/mark-as-read`, recipientIds, { params: markReadParams })
      .subscribe({ error: () => {} });
  }

  markAllAsRead() {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    this.notifications.update(prev => prev.map(n => ({ ...n, isRead: true })));
    this.unreadCount.set(0);

    const markAllParams = new HttpParams().set('userId', userId);
    this.http.post(`${this.apiUrl}/mark-all-read`, {}, { params: markAllParams })
      .subscribe({ error: () => {} });
  }

  // ── Private: API fetching ──────────────────────────────────────────────────

  private _fetchNotifications(reset = false) {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    this.isLoading.set(true);

    const params = new HttpParams()
      .set('userId', userId)
      .set('filter', this.activeFilter())
      .set('page', String(this.page()))
      .set('pageSize', '20');

    this.http.get<any>(this.apiUrl, { params }).subscribe({
      next: (res: any) => {
        // Tolerate both { items: [] } (paged) and { success, data: [] } (legacy) formats
        const items: NotificationRecipient[] = res?.items ?? res?.data ?? [];
        if (reset) {
          // Merge server results with any locally-generated unread items
          const localItems = this.notifications().filter(n => n.id.startsWith('local_'));
          const serverIds = new Set(items.map(i => i.id));
          const newLocals = localItems.filter(l => !serverIds.has(l.id));
          this.notifications.set([...newLocals, ...items]);
        } else {
          this.notifications.update(prev => [...prev, ...items]);
        }
        this.hasMore.set(items.length === 20);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  private _fetchUnreadCount() {
    const userId = this.session.getOISMeetUserId();
    if (!userId) return;

    const params = new HttpParams().set('userId', userId);
    this.http.get<any>(`${this.apiUrl}/unread-count`, { params })
      .subscribe({
        next: (res: any) => {
          const count = typeof res === 'number' ? res : (res?.count ?? res?.data ?? 0);
          this.unreadCount.set(count);
        },
        error: () => {}
      });
  }

  // ── Private: client-side event handlers ───────────────────────────────────

  private _handleIncomingMessage(msg: any): void {
    const myId = this.session.getOISMeetUserId();
    const senderId = (msg.senderId || msg.SenderId)?.toString();
    if (!myId || senderId === myId) return; // ignore self

    const content: string = msg.content || msg.Content || '';
    const myName = this.session.getFullName() || '';

    // Detect @mention of current user (by name or ID)
    const mentionPatterns = [
      myName && `@${myName.toLowerCase()}`,
      `@${myId.toLowerCase()}`
    ].filter(Boolean) as string[];

    const hasMention = mentionPatterns.some(p =>
      content.toLowerCase().includes(p)
    );
    if (!hasMention) return;

    const recipient = this._buildLocalRecipient({
      type: NotificationType.DirectMention,
      actorId: senderId || '',
      actorName: msg.senderName || msg.SenderName || 'Someone',
      actorAvatar: msg.senderAvatarUrl || msg.SenderAvatarUrl,
      entityId: (msg.id || msg.Id)?.toString() || '',
      entityType: 'Message',
      conversationId: (msg.conversationId || msg.ConversationId)?.toString(),
      body: content.length > 120 ? content.substring(0, 120) + '…' : content,
    });

    this._prependIfNew(recipient);
  }

  private _handleReaction(reaction: any): void {
    const myId = this.session.getOISMeetUserId();
    const reactorId = reaction.userId?.toString();
    if (!myId || reactorId === myId) return; // skip own reactions

    const recipient = this._buildLocalRecipient({
      type: NotificationType.Reaction,
      actorId: reactorId || '',
      actorName: reaction.userName || 'Someone',
      entityId: reaction.messageId?.toString() || '',
      entityType: 'Message',
      body: `Reacted with ${reaction.emoji}`,
    });

    this._prependIfNew(recipient);
  }

  private _handleActivity(activity: any): void {
    if (!activity) return;

    const type = (activity.type || activity.activityType) as NotificationType | undefined;
    const recipient = this._buildLocalRecipient({
      type: type || NotificationType.System,
      actorId: activity.actorId || '',
      actorName: activity.actorName || activity.title || 'Activity',
      entityId: activity.entityId?.toString() || '',
      entityType: activity.entityType || '',
      body: activity.body,
    });

    this._prependIfNew(recipient);
  }

  // ── Private: helpers ───────────────────────────────────────────────────────

  private _dtoToRecipient(dto: any): NotificationRecipient {
    const notification: Notification = {
      id: dto.id || this._localId(),
      type: (dto.type as NotificationType) || NotificationType.System,
      actorId: dto.actorId || dto.userId || '',
      actorName: dto.actorName || dto.title || 'System',
      actorAvatar: dto.actorAvatar,
      entityId: dto.entityId || '',
      entityType: dto.entityType || '',
      createdAt: dto.createdAt || new Date().toISOString(),
      priority: dto.priority ?? 1,
      body: dto.body ?? undefined,
      conversationId: dto.conversationId,
    };
    return {
      id: dto.id || this._localId(),
      notificationId: dto.id || '',
      userId: dto.userId || this.session.getOISMeetUserId() || '',
      isRead: dto.isRead ?? false,
      readAt: dto.readAt ?? undefined,
      notification,
    };
  }

  private _buildLocalRecipient(opts: {
    type: NotificationType;
    actorId: string;
    actorName: string;
    actorAvatar?: string;
    entityId: string;
    entityType: string;
    conversationId?: string;
    body?: string;
  }): NotificationRecipient {
    const id = this._localId();
    const now = new Date().toISOString();
    return {
      id,
      notificationId: id,
      userId: this.session.getOISMeetUserId() || '',
      isRead: false,
      notification: {
        id,
        type: opts.type,
        actorId: opts.actorId,
        actorName: opts.actorName,
        actorAvatar: opts.actorAvatar,
        entityId: opts.entityId,
        entityType: opts.entityType,
        createdAt: now,
        priority: 1,
        body: opts.body,
        conversationId: opts.conversationId,
      },
    };
  }

  private _prependIfNew(recipient: NotificationRecipient): void {
    // Deduplicate: skip if same entityId+type already exists and is recent (< 5s)
    const now = Date.now();
    const entityId = recipient.notification?.entityId;
    const type = recipient.notification?.type;

    const isDuplicate = entityId && this.notifications().some(n =>
      n.notification?.entityId === entityId &&
      n.notification?.type === type &&
      (now - new Date(n.notification?.createdAt || 0).getTime()) < 5000
    );
    if (isDuplicate) return;

    this.notifications.update(prev => [recipient, ...prev]);
    if (!recipient.isRead) {
      this.unreadCount.update(c => c + 1);
    }
  }

  private _localId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
