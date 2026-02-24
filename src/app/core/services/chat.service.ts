import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatUser {
  id: string;
  userId: string;
  name?: string;           // Keep for backward compatibility
  fullName?: string;       // New property
  email: string;
  avatarColor: string;
  isOnline: boolean;
  online?: boolean;        // Keep for backward compatibility
  lastSeen?: Date;
  status: string;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageType?: string; // Added this property
  unreadCount: number;
  conversationId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  sentAt: Date;
  sentAtFormatted: string;
  isRead: boolean;
  isDelivered: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  fileSizeFormatted: string;
}

export interface Conversation {
  id: string;
  conversationType: 'Direct' | 'Group';
  conversationName?: string;
  participants: ChatUser[];
  lastMessage?: Message;
  lastMessageAt?: Date;
  unreadCount: number;
}

export interface SendMessageRequest {
  conversationId: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  content: string;
  attachments?: FileAttachment[];
}

export interface FileAttachment {
  fileName: string;
  fileData: string; // Base64
  fileSize: number;
  mimeType: string;
}

export interface TypingIndicatorRequest {
  conversationId: string;
  isTyping: boolean;
}

export interface MessageStatusUpdateRequest {
  messageId: string;
  status: 'Sent' | 'Delivered' | 'Read';
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = `${environment.apiBaseUrl}/chat`;

  constructor(private http: HttpClient) {}

  getConversations(): Observable<ApiResponse<ChatUser[]>> {
    return this.http.get<ApiResponse<ChatUser[]>>(`${this.apiUrl}/conversations`);
  }

  getOrCreateConversation(otherUserId: string): Observable<ApiResponse<Conversation>> {
    return this.http.get<ApiResponse<Conversation>>(`${this.apiUrl}/conversation/${otherUserId}`);
  }

  getMessages(conversationId: string, page: number = 1, pageSize: number = 50): Observable<ApiResponse<Message[]>> {
    return this.http.get<ApiResponse<Message[]>>(`${this.apiUrl}/messages/${conversationId}`, {
      params: { page: page.toString(), pageSize: pageSize.toString() }
    });
  }

  sendMessage(request: SendMessageRequest): Observable<ApiResponse<Message>> {
    return this.http.post<ApiResponse<Message>>(`${this.apiUrl}/messages/send`, request);
  }

  updateMessageStatus(request: MessageStatusUpdateRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/messages/status`, request);
  }

  updateTypingIndicator(request: TypingIndicatorRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/typing`, request);
  }

  markConversationAsRead(conversationId: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/conversation/${conversationId}/read`, {});
  }

  getUnreadCount(): Observable<ApiResponse<number>> {
    return this.http.get<ApiResponse<number>>(`${this.apiUrl}/unread/count`);
  }

  deleteMessage(messageId: string, deleteForEveryone: boolean = false): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.apiUrl}/messages/${messageId}`, {
      params: { deleteForEveryone: deleteForEveryone.toString() }
    });
  }

  uploadFile(file: File): Observable<ApiResponse<Attachment>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApiResponse<Attachment>>(`${this.apiUrl}/upload`, formData);
  }

}
