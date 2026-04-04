export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  sentAt: string;
  isRead: boolean;
  isPending?: boolean;
  isFailed?: boolean;
  fileUrl?: string;
  fileName?: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  userName: string;
}
