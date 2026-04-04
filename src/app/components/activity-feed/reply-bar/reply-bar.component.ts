import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reply-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <footer class="reply-footer-v2">
      <div class="reply-to-bar-v2 animate-slide-up" *ngIf="replyTo">
        <div class="reply-to-content">
          <div class="reply-border"></div>
          <div class="reply-header">
            <span class="reply-to-label">Replying to</span>
            <span class="reply-user">{{ replyTo.senderName }}</span>
          </div>
          <div class="reply-text text-truncate">{{ replyTo.content }}</div>
        </div>
        <button class="btn-close-reply" (click)="cancelReply.emit()">
          <i class="bi bi-x"></i>
        </button>
      </div>

      <div class="message-field-container-v2">
        <div #editor
             class="message-editor-v2"
             contenteditable="true"
             [attr.placeholder]="'Reply to ' + activityName"
             (input)="onInput($event)"
             (keydown)="onKeydown($event)"></div>

        <div class="editor-actions-footer">
          <div class="actions-left">
            <button class="action-btn-v2" (click)="format('bold')" title="Bold">
              <i class="bi bi-type-bold"></i>
            </button>
            <button class="action-btn-v2" (click)="format('italic')" title="Italic">
              <i class="bi bi-type-italic"></i>
            </button>
            <button class="action-btn-v2" (click)="format('underline')" title="Underline">
              <i class="bi bi-type-underline"></i>
            </button>
            
            <div class="v-separator ms-1 me-1"></div>

            <div class="emoji-picker-container">
              <button class="action-btn-v2" (click)="toggleEmoji()" title="Emoji">
                <i class="bi bi-emoji-smile"></i>
              </button>
              <div class="emoji-picker-popover shadow border rounded-3 p-2 bg-white" *ngIf="isEmojiPickerOpen">
                <button *ngFor="let e of emojis" (click)="insertEmoji(e)" class="btn btn-light emoji-btn p-1">{{ e }}</button>
              </div>
            </div>

            <button class="action-btn-v2" (click)="fileInput.click()" [disabled]="isUploading" title="Attach">
              <i class="bi bi-plus-lg" *ngIf="!isUploading"></i>
              <span class="spinner-border spinner-border-sm" *ngIf="isUploading" style="width: 14px; height: 14px;"></span>
            </button>
            <input type="file" #fileInput hidden (change)="onFileSelect($event)">
          </div>

          <div class="actions-right">
            <div class="v-separator"></div>
            <button class="action-btn-v2 send-icon-only" (click)="send()" [disabled]="isSending || (!hasContent && !isUploading)">
              <i class="bi bi-send" *ngIf="!isSending"></i>
              <span class="spinner-border spinner-border-sm" *ngIf="isSending" style="width: 18px; height: 18px;"></span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .reply-footer-v2 {
      padding: 1rem 1.25rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      position: relative;
    }

    .reply-to-bar-v2 {
      display: flex;
      align-items: center;
      background: #ffffff;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      position: relative;
      border: 1px solid #e2e8f0;
      gap: 1rem;
      margin-bottom: 0.75rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);

      .reply-border {
        width: 4px;
        height: 100%;
        background: #0047ba;
        position: absolute;
        left: 0;
        top: 0;
        border-radius: 8px 0 0 8px;
      }

      .reply-header {
        display: flex;
        gap: 0.4rem;
        font-size: 0.75rem;
        margin-bottom: 2px;
        .reply-to-label { color: #64748b; }
        .reply-user { color: #1e293b; font-weight: 600; }
      }

      .reply-text { font-size: 0.85rem; color: #475569; }

      .btn-close-reply {
        width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
        background: #e2e8f0; border: none; border-radius: 50%; color: #475569;
        font-size: 0.7rem; transition: all 0.2s; cursor: pointer;
        &:hover { background: #cbd5e1; color: #0f172a; }
      }
    }

    .message-field-container-v2 {
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-bottom: 4px solid #0047ba;
      border-radius: 4px;
      padding: 0;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      display: flex;
      flex-direction: column;
      position: relative;

      &:focus-within {
        border-color: #cbd5e1;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      }
    }

    .message-editor-v2 {
      padding: 1.25rem 1.25rem 0.5rem;
      min-height: 42px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 0.95rem;
      color: #1f2937;
      line-height: 1.5;
      background: transparent;
      border: none;
      width: 100%;
      outline: none;

      &[placeholder]:empty:before {
        content: attr(placeholder);
        color: #71717a;
        cursor: text;
      }
    }

    .editor-actions-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4rem 0.75rem;
      background: #ffffff;
      border-radius: 0 0 4px 4px;

      .actions-left { display: flex; align-items: center; gap: 0.15rem; }
      .actions-right { display: flex; align-items: center; }
    }

    .action-btn-v2 {
      background: transparent; border: none; color: #6b7280;
      font-size: 1.1rem; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; border-radius: 4px; cursor: pointer;

      &:hover { background: #f3f4f6; color: #111827; }

      &.send-icon-only {
        width: 38px; height: 32px; color: #6b7280;
        i { font-size: 1.3rem; }
        &:hover:not(:disabled) { color: #0047ba; background: #eff6ff; }
        &:disabled { opacity: 0.4; cursor: not-allowed; }
      }
    }

    .v-separator { width: 1px; height: 18px; background: #e5e7eb; margin: 0 0.5rem; }

    .emoji-picker-container {
      position: relative;
    }

    .emoji-picker-popover {
      position: absolute;
      bottom: calc(100% + 12px);
      left: 0;
      z-index: 1000;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
      min-width: 180px;
    }

    .emoji-btn {
      font-size: 1.2rem; border: none;
      &:hover { background: #f1f5f9; }
    }

    .animate-slide-up { animation: slideUpFade 0.25s ease-out; }
    @keyframes slideUpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class ReplyBarComponent {
  @Input() activityName = '';
  @Input() replyTo: any = null;
  @Input() isSending = false;
  @Input() isUploading = false;
  @Output() sendReply = new EventEmitter<{ text: string, html: string }>();
  @Output() fileSelect = new EventEmitter<File>();
  @Output() cancelReply = new EventEmitter<void>();

  @ViewChild('editor') editorRef!: ElementRef;

  isEmojiPickerOpen = false;
  emojis = ['👍', '❤️', '😄', '😮', '😢', '🔥', '👏', '✅', '🎉', '🤔'];
  hasContent = false;

  onInput(event: any) {
    const el = event.target as HTMLElement;
    this.hasContent = (el.innerText || '').trim().length > 0;
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  format(cmd: string) {
    document.execCommand(cmd, false, '');
    this.editorRef.nativeElement.focus();
  }

  toggleEmoji() { this.isEmojiPickerOpen = !this.isEmojiPickerOpen; }

  insertEmoji(e: string) {
    document.execCommand('insertText', false, e);
    this.isEmojiPickerOpen = false;
    this.hasContent = true;
    this.editorRef.nativeElement.focus();
  }

  onFileSelect(event: any) {
    const file = event.target.files?.[0];
    if (file) this.fileSelect.emit(file);
  }

  send() {
    const el = this.editorRef.nativeElement;
    const text = el.innerText.trim();
    const html = el.innerHTML;
    if (text || this.isUploading) {
      this.sendReply.emit({ text, html });
      el.innerHTML = '';
      this.hasContent = false;
    }
  }
}
