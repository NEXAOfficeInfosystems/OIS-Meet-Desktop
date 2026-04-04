export enum ActivityType {
  FileShared = 0,
  Mention = 1,
  MeetingInvite = 2,
  MeetingStarted = 3,
  Reaction = 4,
  Reply = 5,
  TeamCreated = 6,
  ChannelCreated = 7
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  senderId: string;
  recipientId: string;
  contextId: string;
  targetMessageId?: string | null;
  preview?: string | null;
  context?: string | null;
  senderName?: string | null;
  senderAvatar?: string | null;
  createdAt: string;
  isRead: boolean;
  payloadJson?: string | null;
  sender?: any; // To hold resolved user info
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
