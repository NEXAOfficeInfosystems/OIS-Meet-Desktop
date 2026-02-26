import { SessionService } from './session.service';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SendMessageRequest {
  conversationId: string;
  messageType: 'Text' | 'Image' | 'File' | 'System';
  content: string;
  replyToMessageId?: string;
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
  private apiUrl = `${environment.apiBaseUrl}/chat`;

  constructor(
    private http: HttpClient,
    private sessionService: SessionService
  ) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  private getCurrentUserId(): string {
    // Get the current user ID from your session service
    // You need to implement this method in your session service
    return this.sessionService.getOISMeetUserId() || '';
  }

  getUsers(clientId: string, companyId: number): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.get(`${this.apiUrl}/users`, {
      headers: this.getHeaders(),
      params: {
        clientId,
        companyId: companyId.toString(),
        currentUserId: currentUserId
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

  deleteMessage(messageId: string): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`, {
      headers: this.getHeaders(),
      params: { currentUserId: currentUserId }
    });
  }
}
