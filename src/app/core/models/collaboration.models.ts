export interface TeamDto {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdAt: string;
  lastActivityAt?: string | null;
  memberCount: number;
  channels: ChannelDto[];
}

export interface ChannelDto {
  id: string;
  teamId: string;
  name: string;
  description?: string | null;
  channelType: string;
  conversationId?: string | null;
  createdAt: string;
  lastActivityAt?: string | null;
  unreadCount: number;
}

export interface NotificationDto {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface ActivityDto {
  id: string;
  userId: string;
  activityType?: string | null;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  metadata?: any;
}

export interface CallParticipantDto {
  id: string;
  callSessionId: string;
  userId: string;
  status: 'Invited' | 'Joined' | 'Left' | 'Rejected' | 'Missed' | string;
  invitedAt: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export interface CallSessionDto {
  id: string;
  callId: string;
  createdBy: string;
  teamId?: string | null;
  channelId?: string | null;
  title?: string | null;
  callType: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  isScreenSharing: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
  isAudioOn: boolean;
  missedCount: number;
  participants: CallParticipantDto[];
}

export interface CreateTeamRequest {
  name: string;
  description?: string | null;
  createdBy: string;
  memberIds: string[];
}

export interface CreateChannelRequest {
  teamId: string;
  name: string;
  description?: string | null;
  channelType: string;
}

export interface StartCallRequest {
  createdBy: string;
  teamId?: string | null;
  channelId?: string | null;
  title?: string | null;
  callType: string;
  participantIds: string[];
}

export interface JoinCallRequest {
  userId: string;
  userName?: string | null;
}

export interface InviteToCallRequest {
  userId: string;
  invitedBy: string;
}

export interface MarkNotificationsReadRequest {
  userId: string;
  notificationIds: string[];
}

export interface BootstrapResponse {
  teams: TeamDto[];
  notifications: NotificationDto[];
  activity: ActivityDto[];
  unreadNotifications: number;
}
