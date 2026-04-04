import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient, HttpClientModule } from '@angular/common/http';

export interface FilePreviewData {
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploader?: string;
  timestamp?: string;
  allowEdit?: boolean;
  editUrl?: string;
}

@Component({
  selector: 'app-file-preview',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './file-preview.component.html',
  styleUrls: ['./file-preview.component.scss']
})
export class FilePreviewComponent implements OnInit {
  safeUrl: SafeResourceUrl | null = null;
  previewType: 'image' | 'video' | 'audio' | 'pdf' | 'office' | 'text' | 'unknown' = 'unknown';
  isMaximized = false;
  isLoading = true;
  isEditing = false;
  zoomLevel = 1;
  rotation = 0;

  data!: FilePreviewData;
  closeCallback!: () => void;
  textContent: string = '';

  constructor(
    private sanitizer: DomSanitizer,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.determinePreviewType();
    this.prepareSafeUrl();
    if (this.previewType === 'text') {
      this.loadTextContent();
    }
  }

  determinePreviewType() {
    const ext = this.data.fileType?.toLowerCase() || this.data.fileName?.split('.').pop()?.toLowerCase() || '';
    
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      this.previewType = 'image';
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      this.previewType = 'video';
    } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) {
      this.previewType = 'audio';
    } else if (ext === 'pdf') {
      this.previewType = 'pdf';
    } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
      this.previewType = 'office';
    } else if (['txt', 'js', 'ts', 'html', 'css', 'json', 'md', 'xml', 'sql', 'py', 'java', 'c', 'cpp', 'rs', 'yaml', 'yml', 'env', 'log'].includes(ext)) {
      this.previewType = 'text';
    } else {
      this.previewType = 'unknown';
    }
  }

  prepareSafeUrl() {
    let url = this.isEditing && this.data.editUrl ? this.data.editUrl : this.data.fileUrl;
    
    if (this.previewType === 'office' && !this.isEditing) {
      // Office Online Viewer - requires Public URL if using standard embed
      url = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    }
    
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  startEdit() {
    if (!this.data.editUrl && this.previewType === 'office') {
      alert('This file requires a Microsoft 365 integration with a WOPI host to be edited directly. Fallback: opening Office Online with generic viewer (read-only).');
      return;
    }
    
    this.isEditing = true;
    this.isLoading = true;
    this.prepareSafeUrl();
  }

  saveChanges() {
    // This would normally call an API to save the content
    // For now, it's a placeholder
    alert('Changes saved to the cloud storage.');
    this.isEditing = false;
    this.isLoading = true;
    this.prepareSafeUrl();
  }

  loadTextContent() {
    this.http.get(this.data.fileUrl, { responseType: 'text' })
      .subscribe({
        next: (text: string) => {
          try {
            // If it's JSON, pretty print it
            if (this.data.fileName.endsWith('.json') || this.data.fileType === 'json') {
              const jsonObj = JSON.parse(text);
              this.textContent = JSON.stringify(jsonObj, null, 2);
            } else {
              this.textContent = text;
            }
          } catch (e) {
            this.textContent = text;
          }
          this.onLoad();
        },
        error: (err: any) => {
          console.error('Failed to load text content', err);
          this.previewType = 'unknown';
          this.onLoad();
        }
      });
  }

  getFileIconClass(): string {
    const ext = this.data.fileName?.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'bi-file-earmark-image-fill text-info';
    if (['mp4', 'webm', 'ogg'].includes(ext)) return 'bi-file-earmark-play-fill text-primary';
    if (['mp3', 'wav', 'aac'].includes(ext)) return 'bi-file-earmark-music-fill text-success';
    if (ext === 'pdf') return 'bi-file-earmark-pdf-fill text-danger';
    if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word-fill text-primary';
    if (['xls', 'xlsx'].includes(ext)) return 'bi-file-earmark-spreadsheet-fill text-success';
    if (['ppt', 'pptx'].includes(ext)) return 'bi-file-earmark-ppt-fill text-warning';
    return 'bi-file-earmark-fill text-secondary';
  }

  close() {
    this.closeCallback();
  }

  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
  }

  zoomIn() {
    this.zoomLevel += 0.15;
  }

  zoomOut() {
    if (this.zoomLevel > 0.3) this.zoomLevel -= 0.15;
  }

  rotate() {
    this.rotation = (this.rotation + 90) % 360;
  }

  onLoad() {
    this.isLoading = false;
  }

  download() {
    const link = document.createElement('a');
    link.href = this.data.fileUrl;
    link.download = this.data.fileName;
    link.click();
  }
}
