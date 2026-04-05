export enum NotificationType {
    DirectMention = 'DirectMention',
    GroupMention = 'GroupMention',
    ThreadReply = 'ThreadReply',
    Reaction = 'Reaction',
    MeetingCreated = 'MeetingCreated',
    MeetingUpdated = 'MeetingUpdated',
    MeetingCanceled = 'MeetingCanceled',
    MissedCall = 'MissedCall',
    System = 'System'
}

export interface Notification {
    id: string;
    type: NotificationType;
    actorId: string;
    actorName?: string;
    actorAvatar?: string;
    entityId: string;
    entityType: string;
    contextId?: string;
    createdAt: string;
    priority: number;
}

export interface NotificationRecipient {
    id: string; // The ID of the recipient record (NotificationRecipient.Id)
    notificationId: string;
    userId: string;
    isRead: boolean;
    readAt?: string;
    notification?: Notification;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
}
