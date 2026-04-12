import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';

export interface ActivityChatTarget {
  conversationId?: string;
  messageId?: string;
  senderId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityChatBridgeService {
  private chatTrigger = new ReplaySubject<ActivityChatTarget>(1);
  chatTrigger$ = this.chatTrigger.asObservable();

  /**
   * Triggers the chat panel to open a specific context
   */
  openChat(target: ActivityChatTarget) {
    this.chatTrigger.next(target);
  }
}
