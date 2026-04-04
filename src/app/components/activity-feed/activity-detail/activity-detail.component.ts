import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';
import { ReplyBarComponent } from '../reply-bar/reply-bar.component';

@Component({
  selector: 'app-activity-detail',
  standalone: true,
  imports: [CommonModule, SafeHtmlPipe, ReplyBarComponent],
  template: `
    <main class="activity-detail-container" *ngIf="activity; else noSelection">
      
      <!-- Sticky Header -->
      <header class="detail-header">
        <div class="user-context">
          <div class="avatar-large" [style.background-color]="activity.avatarColor">
             {{ activity.avatarLetter }}
          </div>
          <div class="user-info">
             <div class="name-status">
               <h1 class="user-name">{{ activity.senderName }}</h1>
               <span class="action-status">{{ activity.category === 'file' ? 'shared a file' : 'is in a conversation with you' }}</span>
             </div>
             <span class="timestamp">{{ activity.timeLabel }}</span>
             
             <!-- Tab Bar -->
             <nav class="tab-bar">
               <button class="tab-btn" 
                       [class.active]="activeTab === 'Chat'" 
                       (click)="activeTab = 'Chat'">Chat</button>
               <button class="tab-btn" 
                       [class.active]="activeTab === 'Files'" 
                       (click)="activeTab = 'Files'">Shared</button>
             </nav>
          </div>
        </div>

        <div class="header-actions">
           <button class="icon-btn" (click)="refresh.emit()" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>
           <button class="icon-btn" title="Search"><i class="bi bi-search"></i></button>
           <button class="icon-btn" title="More options"><i class="bi bi-three-dots"></i></button>
        </div>
      </header>

      <!-- Content Area -->
      <div class="content-viewport" *ngIf="activeTab === 'Chat'">
         <div class="message-thread" #threadContainer (scroll)="onScroll($event)">
           
           <!-- Infinite Loader -->
           <div class="top-loader" *ngIf="loadingContext && messages.length > 0">
             <div class="spinner-border spinner-border-sm text-primary"></div>
           </div>

           <!-- Message Items -->
           <div class="message-item" 
                *ngFor="let msg of messages"
                [class.is-self]="msg.senderId === currentUserId"
                [id]="'msg-' + msg.id">
             
             <div class="msg-avatar" *ngIf="msg.senderId !== currentUserId">
                {{ (msg.senderName || 'U').charAt(0).toUpperCase() }}
             </div>

             <div class="msg-bubble-wrap">
               <div class="msg-meta" *ngIf="msg.senderId !== currentUserId">
                 <span class="sender">{{ msg.senderName }}</span>
                 <span class="time">{{ (msg.sentAt || msg.createdAt) | date:'shortTime' }}</span>
               </div>
               
               <div class="msg-bubble">
                  <div [innerHTML]="msg.content | safeHtml"></div>
               </div>
             </div>
           </div>

           <!-- Empty State / File Card -->
           <div class="empty-conversation" *ngIf="messages.length === 0 && !loadingContext">
              <div class="file-shared-card" *ngIf="activity.category === 'file'">
                 <div class="file-icon-large">
                    <i class="bi bi-file-earmark-text-fill"></i>
                 </div>
                 <h2 class="file-name">{{ activity.body || 'Shared file' }}</h2>
                 <p class="file-info">Shared by {{ activity.senderName }} • {{ activity.timeLabel }}</p>
                 <div class="file-actions">
                    <button class="btn-primary" (click)="fileAction.emit('open')">Open</button>
                    <button class="btn-outline" (click)="fileAction.emit('download')">Download</button>
                 </div>
              </div>
              <div class="generic-empty" *ngIf="activity.category !== 'file'">
                 <i class="bi bi-chat-left-text-fill opacity-25" style="font-size: 3rem;"></i>
                 <p class="mt-3">Start a conversation with {{ activity.senderName }}</p>
              </div>
           </div>
         </div>

         <!-- Reply Area -->
         <app-reply-bar
           [activityName]="activity.senderName"
           [replyTo]="replyTo"
           [isSending]="isSending"
           [isUploading]="isUploading"
           (sendReply)="sendReply.emit($event)"
           (fileSelect)="fileSelect.emit($event)"
           (cancelReply)="cancelReply.emit()">
         </app-reply-bar>
      </div>

      <!-- Shared Files Content -->
      <div class="content-viewport shared-files" *ngIf="activeTab === 'Files'">
         <div class="files-header">Shared in this conversation</div>
         <div class="files-list">
            <div class="file-row" *ngFor="let file of sharedFiles">
               <i class="bi bi-file-earmark-text"></i>
               <span class="file-name-text">{{ file.fileName }}</span>
               <button class="icon-btn-sm" (click)="fileAction.emit('download')"><i class="bi bi-download"></i></button>
            </div>
         </div>
      </div>
    </main>

    <ng-template #noSelection>
      <div class="no-selection-view">
        <div class="ns-art">
           <i class="bi bi-bell-fill"></i>
        </div>
        <h3>Select an activity to view details</h3>
        <p>Catch up on mentions, shared files, and more.</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .activity-detail-container {
      flex: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: white;
      overflow: hidden;
    }

    .detail-header {
      padding: 16px 24px 0;
      border-bottom: 1px solid #f0f1f4;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: white;
    }

    .user-context { display: flex; gap: 16px; flex: 1; }
    
    .avatar-large {
      width: 48px; height: 48px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 18px; flex-shrink: 0;
    }

    .user-info { flex: 1; }
    .name-status { display: flex; align-items: baseline; gap: 8px; }
    .user-name { font-size: 16px; font-weight: 700; margin: 0; color: #1a1d21; }
    .action-status { font-size: 13px; color: #64748b; }
    .timestamp { font-size: 12px; color: #8b949e; display: block; margin-top: 2px; }

    .tab-bar { display: flex; gap: 20px; margin-top: 12px; }
    .tab-btn {
      padding: 8px 0; border: none; background: transparent; font-size: 13px;
      font-weight: 600; color: #64748b; border-bottom: 2px solid transparent;
      cursor: pointer; transition: all 0.2s;
      &:hover { color: #1a1d21; }
      &.active { color: #0066FF; border-color: #0066FF; }
    }

    .header-actions { display: flex; gap: 8px; padding-top: 4px; }
    .icon-btn {
      width: 34px; height: 34px; border: none; background: transparent;
      color: #64748b; border-radius: 6px; font-size: 16px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; &:hover { background: #f1f5f9; color: #1a1d21; }
    }

    .content-viewport { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    
    .message-thread {
      flex: 1; overflow-y: auto; padding: 24px;
      display: flex; flex-direction: column; gap: 12px;
      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
    }

    .message-item {
      display: flex; gap: 12px; max-width: 85%;
      &.is-self { align-self: flex-end; flex-direction: row-reverse; }
    }

    .msg-avatar {
      width: 32px; height: 32px; border-radius: 50%; background: #f0f1f4;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #64748b; flex-shrink: 0;
    }

    .msg-bubble-wrap { display: flex; flex-direction: column; gap: 4px; }
    .msg-meta { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
    .sender { font-size: 12px; font-weight: 700; color: #1a1d21; }
    .time { font-size: 10px; color: #8b949e; }

    .msg-bubble {
      padding: 10px 14px; border-radius: 12px; background: #f1f4f8;
      font-size: 14px; color: #1a1d21; line-height: 1.5;
    }

    .is-self .msg-bubble { background: #0066FF; color: white; border-radius: 12px 12px 2px 12px; }

    .file-shared-card {
      align-self: center; margin: 40px auto; padding: 40px; text-align: center;
      background: white; border: 1px solid #e2e8f0; border-radius: 16px;
      max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.04);
    }
    .file-icon-large { font-size: 64px; color: #0066FF; margin-bottom: 24px; }
    .file-name { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #1a1d21; }
    .file-info { font-size: 14px; color: #64748b; margin-bottom: 32px; }
    .file-actions { display: flex; gap: 12px; justify-content: center; }
    .btn-primary { 
      padding: 10px 24px; background: #0066FF; color: white; border: none; 
      border-radius: 8px; font-weight: 600; cursor: pointer; &:hover { background: #0052cc; }
    }
    .btn-outline {
      padding: 10px 24px; background: transparent; color: #1a1d21; 
      border: 1.5px solid #e2e8f0; border-radius: 8px; font-weight: 600; 
      cursor: pointer; &:hover { background: #f8fafc; }
    }

    .no-selection-view {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 40px; text-align: center; color: #64748b;
    }
    .ns-art { 
      font-size: 48px; width: 96px; height: 96px; background: #f8fafc;
      border-radius: 32px; display: flex; align-items: center; justify-content: center;
      color: #0066FF; margin-bottom: 24px; opacity: 0.5;
    }

    .shared-files { padding: 24px; }
    .files-header { font-weight: 700; margin-bottom: 16px; font-size: 15px; }
    .file-row {
      display: flex; align-items: center; gap: 12px; padding: 12px;
      border-radius: 8px; border: 1px solid #f0f1f4; margin-bottom: 8px;
      i { font-size: 20px; color: #0066FF; }
      .file-name-text { flex: 1; font-size: 14px; font-weight: 500; }
    }
  `]
})
export class ActivityDetailComponent implements AfterViewChecked {
  @Input() activity: any = null;
  @Input() messages: any[] = [];
  @Input() currentUserId: string | null = '';
  @Input() loadingContext = false;
  @Input() isSending = false;
  @Input() isUploading = false;
  @Input() replyTo: any = null;
  @Input() sharedFiles: any[] = [];
  
  @Output() refresh = new EventEmitter<void>();
  @Output() sendReply = new EventEmitter<{ text: string, html: string }>();
  @Output() fileSelect = new EventEmitter<File>();
  @Output() cancelReply = new EventEmitter<void>();
  @Output() fileAction = new EventEmitter<'open' | 'download'>();
  @Output() loadMore = new EventEmitter<void>();

  @ViewChild('threadContainer') threadContainer!: ElementRef;

  activeTab: 'Chat' | 'Files' = 'Chat';
  private shouldScrollBottom = false;

  ngAfterViewChecked() {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  scrollToBottom() {
    if (this.threadContainer) {
      const el = this.threadContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  onScroll(event: any) {
     const el = event.target;
     if (el.scrollTop < 50 && !this.loadingContext) {
        this.loadMore.emit();
     }
  }

  // Helper to trigger scroll from parent
  forceScroll() {
     this.shouldScrollBottom = true;
  }
}
