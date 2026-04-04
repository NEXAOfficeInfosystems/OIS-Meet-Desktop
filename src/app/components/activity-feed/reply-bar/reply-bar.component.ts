import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reply-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <footer class="reply-footer">
      <div class="reply-to-bar" *ngIf="replyTo">
        <div class="reply-to-content">
          <i class="bi bi-reply-fill text-primary"></i>
          <span class="fs-xs ms-1">Replying to <strong>{{ replyTo.senderName }}</strong></span>
        </div>
        <button class="btn-icon-xs" (click)="cancelReply.emit()"><i class="bi bi-x"></i></button>
      </div>

      <div class="reply-toolbar">
        <button (click)="format('bold')" class="tool-btn" title="Bold"><i class="bi bi-type-bold"></i></button>
        <button (click)="format('italic')" class="tool-btn" title="Italic"><i class="bi bi-type-italic"></i></button>
        <button (click)="format('underline')" class="tool-btn" title="Underline"><i class="bi bi-type-underline"></i></button>
        <span class="v-sep"></span>
        <button (click)="toggleEmoji()" class="tool-btn" title="Emoji"><i class="bi bi-emoji-smile"></i></button>
        <div class="emoji-popover" *ngIf="isEmojiPickerOpen">
          <button *ngFor="let e of emojis" (click)="insertEmoji(e)" class="emoji-item">{{ e }}</button>
        </div>
      </div>

      <div class="reply-input-wrap">
        <div #editor
             class="reply-editor"
             contenteditable="true"
             [attr.placeholder]="'Reply to ' + activityName"
             (input)="onInput($event)"
             (keydown)="onKeydown($event)"></div>
        
        <div class="reply-actions">
          <button class="input-action-btn" (click)="fileInput.click()" [disabled]="isUploading">
            <i class="bi bi-paperclip" *ngIf="!isUploading"></i>
            <span class="spinner-border spinner-border-sm" *ngIf="isUploading"></span>
          </button>
          <input type="file" #fileInput hidden (change)="onFileSelect($event)">
          
          <button class="btn-send" (click)="send()" [disabled]="isSending || !hasContent">
            <i class="bi bi-send-fill" *ngIf="!isSending"></i>
            <span class="spinner-border spinner-border-sm" *ngIf="isSending"></span>
          </button>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .reply-footer {
      border-top: 1px solid #f0f1f4;
      background: #ffffff;
      padding-bottom: 8px;
    }

    .reply-to-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 16px;
      background: #f0f7ff;
      border-bottom: 1px solid #e1e9f4;
      font-size: 11px;
    }

    .reply-toolbar {
      display: flex;
      padding: 8px 16px 4px;
      gap: 4px;
      position: relative;
    }

    .tool-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: 4px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover { background: #f1f5f9; color: #1e293b; }
    }

    .v-sep { width: 1px; height: 16px; background: #e2e8f0; margin: 0 4px; align-self: center; }

    .emoji-popover {
      position: absolute;
      bottom: 40px;
      left: 16px;
      background: white;
      border: 1px solid #e1e9f4;
      border-radius: 8px;
      padding: 8px;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      z-index: 100;
    }

    .emoji-item {
      border: none;
      background: transparent;
      font-size: 1.2rem;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      &:hover { background: #f1f5f9; }
    }

    .reply-input-wrap {
      display: flex;
      align-items: flex-end;
      padding: 4px 16px 8px;
      gap: 8px;
    }

    .reply-editor {
      flex: 1;
      min-height: 38px;
      max-height: 120px;
      overflow-y: auto;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 13px;
      outline: none;
      word-break: break-all;
      transition: all 0.2s;
      &:focus { border-color: #0066FF; background: #fff; box-shadow: 0 0 0 2px rgba(0,102,255,0.1); }
      &[contenteditable]:empty:before {
        content: attr(placeholder);
        color: #94a3b8;
      }
    }

    .reply-actions { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .input-action-btn {
      width: 34px; height: 34px; border: none; background: transparent;
      color: #64748b; font-size: 18px; display: flex; align-items: center; justify-content: center;
      border-radius: 50%; cursor: pointer; &:hover { background: #f1f5f9; color: #1e293b; }
    }

    .btn-send {
      width: 36px; height: 36px; border: none; background: #0066FF;
      color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,102,255,0.3); cursor: pointer; transition: all 0.2s;
      &:hover { background: #0052cc; transform: translateY(-1px); }
      &:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; }
    }
    
    .spinner-border-sm { width: 14px; height: 14px; border-width: 2px; }
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
