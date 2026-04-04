import { SessionService } from './session.service';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SendMessageRequest {
  conversationId: string;
  senderId?: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  content: string;
  formattedContent?: string;
  replyToMessageId?: string;
  fileUrl?: string;
  fileName?: string;
  attachments?: AttachmentDto[];
}

export interface AttachmentDto {
  fileName: string;
  fileData: string;
  fileSize: number;
  mimeType: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = `${environment.apiBaseUrl}/Chat`;

  constructor(
    private http: HttpClient,
    private sessionService: SessionService
  ) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.sessionService.getSsoToken()}`
    });
  }

  public getCurrentUserId(): string {
    // Get the current user ID from your session service
    // You need to implement this method in your session service
    return this.sessionService.getOISMeetUserId() || '';
  }

  getUsers(clientId: string, companyId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/users`, {
      headers: this.getHeaders(),
      params: {
        clientId,
        companyId: companyId.toString()
      }
    });
  }

  getConversations(): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.get(`${this.apiUrl}/conversations`, {
      headers: this.getHeaders(),
      params: { currentUserId: currentUserId }
    });
  }

  getActiveUsers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/active`, {
      headers: this.getHeaders()
    });
  }

  getMessages(conversationId: string, page: number = 1, pageSize: number = 50): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.get(`${this.apiUrl}/messages/${conversationId}`, {
      headers: this.getHeaders(),
      params: {
        page: page.toString(),
        pageSize: pageSize.toString(),
        currentUserId: currentUserId
      }
    });
  }

  createOrGetDirectConversation(otherUserId: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    const requestBody = {
      otherUserId: otherUserId,
      currentUserId: currentUserId
    };

    return this.http.post(
      `${this.apiUrl}/conversations/direct`,
      requestBody,
      {
        headers: this.getHeaders()
      }
    );
  }

  createGroupConversation(groupName: string, members: string[]): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.post(
      `${this.apiUrl}/conversations/group`,
      { groupName, members: [currentUserId, ...members] },
      { headers: this.getHeaders() }
    );
  }

  markMessagesAsRead(conversationId: string, messageIds: string[]): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    const requestBody = {
      conversationId: conversationId,
      messageIds: messageIds,
      currentUserId: currentUserId
    };

    return this.http.post(
      `${this.apiUrl}/messages/read`,
      requestBody,
      {
        headers: this.getHeaders()
      }
    );
  }

  // --- NEW WORKFLOWS PER feature/meeting-page-enhancement ---

  sendMessageApi(
    conversationId: string,
    content: string,
    type: string = 'Text',
    fileUrl?: string,
    fileName?: string,
    replyToMessageId?: string,
    formattedContent?: string
  ): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    const requestBody: any = {
      conversationId: conversationId,
      senderId: currentUserId,
      content: content,
      messageType: type,
      fileUrl: fileUrl,
      fileName: fileName,
      formattedContent,
      replyToMessageId
    };

    return this.http.post(`${this.apiUrl}/send`, requestBody, {
      headers: this.getHeaders()
    });
  }

  editMessage(messageId: string, content: string, formattedContent?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/messages/${messageId}`, {
      currentUserId: this.getCurrentUserId(),
      content,
      formattedContent
    }, {
      headers: this.getHeaders()
    });
  }

  deleteMessage(messageId: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`, {
      headers: this.getHeaders(),
      params: { currentUserId }
    });
  }

  addReaction(messageId: string, emoji: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.post(`${this.apiUrl}/reactions`, {
      currentUserId,
      messageId,
      emoji
    }, {
      headers: this.getHeaders()
    });
  }

  removeReaction(messageId: string, emoji: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    const requestBody = {
      currentUserId,
      messageId,
      emoji
    };
    return this.http.delete(`${this.apiUrl}/reactions`, {
      headers: this.getHeaders(),
      body: requestBody
    });
  }

  togglePinConversation(conversationId: string, isPinned: boolean): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.post(`${this.apiUrl}/conversations/pin`, {
      currentUserId,
      conversationId,
      isPinned
    }, {
      headers: this.getHeaders()
    });
  }

  addMemberToConversation(conversationId: string, userIds: string[]): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.post(`${this.apiUrl}/conversations/add-member`, {
      conversationId,
      userIds,
      currentUserId
    }, {
      headers: this.getHeaders()
    });
  }

  updateGroupInfo(conversationId: string, groupName?: string, avatarUrl?: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.put(`${this.apiUrl}/conversations/${conversationId}/group-info`, {
      groupName,
      avatarUrl,
      currentUserId
    }, {
      headers: this.getHeaders()
    });
  }
}
