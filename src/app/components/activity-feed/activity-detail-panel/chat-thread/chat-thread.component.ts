import { Component, input, inject, ViewChild, ElementRef, effect, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from '../../../../core/services/message.service';
import { SessionService } from '../../../../core/services/session.service';
import { Message } from '../../../../core/models/message.models';

@Component({
  selector: 'app-chat-thread',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-thread.component.html',
  styleUrl: './chat-thread.component.scss'
})
export class ChatThreadComponent implements AfterViewChecked {
  contextId = input.required<string>();
  
  messageService = inject(MessageService);
  sessionService = inject(SessionService);
  
  messages = this.messageService.threads;
  loadingContexts = this.messageService.loadingContexts;
  
  currentUserId = signal<string>(this.sessionService.getOISMeetUserId() || '');

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  private shouldScrollToBottom = false;

  constructor() {
    effect(() => {
      const id = this.contextId();
      if (id) {
        this.messageService.loadThread(id);
        this.shouldScrollToBottom = true;
      }
    });

    effect(() => {
      const msgs = this.messages()[this.contextId()];
      if (msgs) {
        this.shouldScrollToBottom = true;
      }
    });
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  scrollToBottom() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  getThreadMessages() {
    return this.messages()[this.contextId()] || [];
  }

  isLoading() {
    return this.loadingContexts().has(this.contextId());
  }
}
