import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';
import { ReplyBarComponent } from '../reply-bar/reply-bar.component';

@Component({
  selector: 'app-activity-detail',
  standalone: true,
  imports: [CommonModule, SafeHtmlPipe, ReplyBarComponent],
  template: `
    <main class="activity-detail-container-v2" *ngIf="activity; else noSelection">
      
      <!-- Sticky Header V2 -->
      <header class="detail-header-v2 border-bottom">
        <div class="user-context-v2 d-flex align-items-center gap-3 px-4 py-3">
          <div class="avatar-v2 position-relative">
            <div class="avatar-sq-v2 shadow-sm" [style.background-color]="activity.avatarColor">
              {{ activity.avatarLetter }}
            </div>
          </div>
          
          <div class="user-info-v2 min-w-0">
            <div class="title-top-v2 d-flex align-items-baseline gap-2">
              <h1 class="user-name-v2">{{ activity.senderName }}</h1>
              <span class="action-status-v2">{{ activity.category === 'file' ? 'shared a file' : 'is in a conversation' }}</span>
            </div>
            <div class="timestamp-v2">{{ activity.timeLabel }}</div>
          </div>

          <div class="header-actions-v2 ms-auto d-flex gap-2">
            <button class="icon-btn-v2" (click)="refresh.emit()" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>
            <button class="icon-btn-v2" title="More options"><i class="bi bi-three-dots"></i></button>
          </div>
        </div>

        <!-- Tab Bar V2 -->
        <nav class="tab-bar-v2 d-flex px-4 border-bottom">
          <button class="tab-btn-v2" [class.active]="activeTab === 'Chat'" (click)="activeTab = 'Chat'">Chat</button>
          <button class="tab-btn-v2" [class.active]="activeTab === 'Files'" (click)="activeTab = 'Files'">Files</button>
        </nav>
      </header>

      <!-- Content Area V2 -->
      <div class="content-viewport-v2 flex-grow-1 d-flex flex-column" *ngIf="activeTab === 'Chat'">
         <div class="chat-thread-v2 p-4 flex-grow-1 overflow-auto d-flex flex-column gap-4" #threadContainer (scroll)="onScroll($event)">
           
           <div class="top-loader-v2 text-center py-2" *ngIf="loadingContext && messages.length > 0">
             <div class="spinner-border spinner-border-sm text-primary"></div>
           </div>

           <!-- Message Items V2 -->
           <div class="message-wrapper-v2 d-flex gap-3" 
                *ngFor="let msg of messages"
                [class.self-v2]="msg.senderId === currentUserId"
                [id]="'msg-' + msg.id">
             
             <div class="message-avatar-v2 flex-shrink-0" *ngIf="msg.senderId !== currentUserId">
                <div class="avatar-fallback-v2">
                  {{ (msg.senderName || 'U').charAt(0).toUpperCase() }}
                </div>
             </div>

             <div class="message-body-v2 min-w-0 d-flex flex-column gap-1">
               <div class="message-header-v2 d-flex align-items-baseline gap-2" *ngIf="msg.senderId !== currentUserId">
                 <span class="sender-v2 text-truncate fw-bold">{{ msg.senderName }}</span>
                 <span class="time-v2 fs-xs text-muted">{{ (msg.sentAt || msg.createdAt) | date:'shortTime' }}</span>
               </div>
               
               <div class="bubble-v2 px-3 py-2 rounded-3 border bg-light text-dark shadow-sm" [innerHTML]="msg.content | safeHtml"></div>
               
               <div class="status-v2 mt-1" *ngIf="msg.isPending || msg.isFailed">
                 <i class="bi bi-clock text-muted fs-xs" *ngIf="msg.isPending"></i>
                 <i class="bi bi-exclamation-circle text-danger fs-xs" *ngIf="msg.isFailed"></i>
               </div>
             </div>
           </div>

           <!-- Empty States -->
           <div class="empty-state-v2 flex-grow-1 d-flex flex-column align-items-center justify-content-center p-5 text-center" *ngIf="messages.length === 0 && !loadingContext">
              <div class="file-card-v2 p-5 bg-white border rounded-4 shadow-sm" style="max-width: 400px;" *ngIf="activity.category === 'file'">
                 <div class="shared-icon-v2 mb-4 text-primary fs-1">
                    <i class="bi bi-file-earmark-text-fill"></i>
                 </div>
                 <h2 class="h5 fw-bold mb-2">{{ activity.body || 'Shared file' }}</h2>
                 <p class="text-muted small mb-4">Shared by {{ activity.senderName }} • {{ activity.timeLabel }}</p>
                 <div class="d-flex gap-2 justify-content-center">
                    <button class="btn btn-primary btn-sm px-4" (click)="fileAction.emit('open')">Open</button>
                    <button class="btn btn-outline-secondary btn-sm px-4" (click)="fileAction.emit('download')">Download</button>
                 </div>
              </div>
              
              <div class="chat-placeholder-v2 opacity-50" *ngIf="activity.category !== 'file'">
                 <i class="bi bi-chat-dots-fill display-4 mb-3"></i>
                 <p>Start a conversation with {{ activity.senderName }}</p>
              </div>
           </div>
         </div>

         <!-- Reply Bar Area -->
         <app-reply-bar
           class="border-top"
           [activityName]="activity.senderName"
           [replyTo]="replyTo"
           [isSending]="isSending"
           [isUploading]="isUploading"
           (sendReply)="sendReply.emit($event)"
           (fileSelect)="fileSelect.emit($event)"
           (cancelReply)="cancelReply.emit()">
         </app-reply-bar>
      </div>

      <!-- Shared Files V2 -->
      <div class="content-viewport-v2 p-4" *ngIf="activeTab === 'Files'">
         <h5 class="fw-bold mb-4">Shared in this conversation</h5>
         <div class="files-grid d-flex flex-column gap-2">
            <div class="file-item-v2 d-flex align-items-center gap-3 p-3 bg-white border rounded-3 hover-shadow transition" *ngFor="let file of sharedFiles">
               <div class="fs-3 text-primary"><i class="bi bi-file-earmark-text"></i></div>
               <span class="flex-grow-1 text-truncate fw-medium">{{ file.fileName }}</span>
               <button class="btn btn-icon btn-sm text-muted" (click)="fileAction.emit('download')"><i class="bi bi-download"></i></button>
            </div>
         </div>
      </div>
    </main>

    <ng-template #noSelection>
      <div class="no-selection-view-v2 d-flex flex-column align-items-center justify-content-center h-100 p-5 text-center bg-light opacity-50">
        <div class="ns-icon-v2 bg-white rounded-4 shadow-sm p-4 mb-4 fs-1 text-primary">
           <i class="bi bi-bell-fill"></i>
        </div>
        <h3 class="h5 fw-bold">Select an activity to view details</h3>
        <p class="text-muted small">Catch up on mentions, shared files, and more.</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .activity-detail-container-v2 { height: 100%; overflow: hidden; background: #ffffff; }
    
    .detail-header-v2 { background: #ffffff; }
    .avatar-sq-v2 { width: 42px; height: 42px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 1.1rem; }
    .user-name-v2 { font-size: 1.1rem; font-weight: 700; color: #242424; margin: 0; }
    .action-status-v2 { font-size: 0.85rem; color: #616161; }
    .timestamp-v2 { font-size: 0.75rem; color: #8b949e; }
    
    .icon-btn-v2 { border: none; background: transparent; width: 34px; height: 34px; border-radius: 4px; color: #616161; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; &:hover { background: #f3f2f1; color: #0047ba; } }
    
    .tab-bar-v2 { background: #ffffff; gap: 1.5rem; height: 44px; align-items: center; }
    .tab-btn-v2 { background: transparent; border: none; padding: 0.75rem 0; font-size: 0.9rem; font-weight: 600; color: #616161; cursor: pointer; position: relative; transition: all 0.2s; &:hover { color: #242424; } &.active { color: #0047ba; &::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #0047ba; border-radius: 3px 3px 0 0; } } }
    
    .chat-thread-v2 { &::-webkit-scrollbar { width: 6px; } &::-webkit-scrollbar-thumb { background: #e1e9f4; border-radius: 10px; } }
    
    .message-wrapper-v2 { max-width: 85%; &.self-v2 { align-self: flex-end; flex-direction: row-reverse; .message-body-v2 { align-items: flex-end; } .bubble-v2 { background: #eff6ff; border-color: #dbeafe; color: #1e3a8a; } } }
    .avatar-fallback-v2 { width: 32px; height: 32px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 0.85rem; }
    
    .bubble-v2 { line-height: 1.5; font-size: 0.95rem; }
    
    .file-item-v2 { transition: all 0.2s; cursor: pointer; &:hover { border-color: #0047ba; box-shadow: 0 4px 12px rgba(0,0,0,0.05); } }
    .hover-shadow:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .transition { transition: all 0.2s; }
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
