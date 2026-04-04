import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Message } from '../models/message.models';
import { PagedResult } from '../models/activity.models';
import { environment } from '../../../environments/environment';
import { ChatSignalrService } from './chat-signalr.service';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private http = inject(HttpClient);
  private signalr = inject(ChatSignalrService);
  private session = inject(SessionService);
  private apiUrl = `${environment.apiBaseUrl}/messages`;

  // Signals State
  threads = signal<Record<string, Message[]>>({});
  loadingContexts = signal<Set<string>>(new Set());
  newMessageCounts = signal<Record<string, number>>({});

  constructor() {
    this.signalr.messageReceived$.subscribe(msg => {
      if (msg) this.onSignalRMessage(msg);
    });
  }

  loadThread(contextId: string) {
    if (this.threads()[contextId] || this.loadingContexts().has(contextId)) return;

    this.loadingContexts.update(prev => {
      const next = new Set(prev);
      next.add(contextId);
      return next;
    });

    this.http.get<PagedResult<Message>>(`${this.apiUrl}/${contextId}?page=1&pageSize=50`)
      .subscribe({
        next: (res) => {
          this.threads.update(prev => ({
            ...prev,
            [contextId]: res.items
          }));
          this.loadingContexts.update(prev => {
            const next = new Set(prev);
            next.delete(contextId);
            return next;
          });
        },
        error: () => {
          this.loadingContexts.update(prev => {
            const next = new Set(prev);
            next.delete(contextId);
            return next;
          });
        }
      });
  }

  sendMessage(contextId: string, text: string) {
    const optimisticMessage: Message = {
      id: Math.random().toString(), // Temp ID
      conversationId: contextId,
      senderId: this.session.getOISMeetUserId() || 'me',
      senderName: this.session.getFullName() || 'You',
      content: text,
      messageType: 'Text',
      sentAt: new Date().toISOString(),
      isRead: false,
      isPending: true
    };

    // Update locally
    this.threads.update(prev => ({
      ...prev,
      [contextId]: [...(prev[contextId] || []), optimisticMessage]
    }));

    this.http.post<Message>(this.apiUrl, { contextId, text })
      .subscribe({
        next: (confirmed) => {
          this.threads.update(prev => ({
            ...prev,
            [contextId]: prev[contextId].map(m => m.id === optimisticMessage.id ? confirmed : m)
          }));
        },
        error: () => {
          this.threads.update(prev => ({
            ...prev,
            [contextId]: prev[contextId].map(m => m.id === optimisticMessage.id ? { ...m, isPending: false, isFailed: true } : m)
          }));
        }
      });
  }

  onSignalRMessage(msg: any) {
    const contextId = msg.conversationId || msg.contextId;
    if (!contextId) return;

    this.threads.update(prev => ({
      ...prev,
      [contextId]: [...(prev[contextId] || []), msg]
    }));

    // Logic for unread badge if user is scrolled up (will be handled by component usually, but service can track count)
    // Here we'll just track new arrivals for contexts that are currently "open" but with a count
    this.newMessageCounts.update(prev => ({
      ...prev,
      [contextId]: (prev[contextId] || 0) + 1
    }));
  }

  resetNewMessageCount(contextId: string) {
    this.newMessageCounts.update(prev => ({
      ...prev,
      [contextId]: 0
    }));
  }
}
