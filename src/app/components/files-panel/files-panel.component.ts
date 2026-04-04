import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ActivityDto } from '../../core/models/collaboration.models';
import { PreviewService } from '../../core/services/preview.service';
import { FileService } from '../../core/services/file.service';

@Component({
  selector: 'app-files-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files-panel.component.html',
  styleUrl: './files-panel.component.scss'
})
export class FilesPanelComponent implements OnInit {
  files: ActivityDto[] = [];

  constructor(
    private readonly collaboration: CollaborationService,
    private previewService: PreviewService,
    private fileService: FileService
  ) {}

  openPreview(file: ActivityDto): void {
    // Assuming file.metadata contains URL or it's in the body
    // This part depends on how ActivityDto is structured
    const url = file.metadata?.['fileUrl'] || ''; 
    if (!url) return;

    this.previewService.open({
      fileName: file.title || 'Unknown File',
      fileUrl: this.fileService.getFileUrl(url),
      fileType: file.title?.split('.').pop()?.toLowerCase() || '',
      uploader: 'System', // Or from file.userId
      timestamp: new Date(file.createdAt).toLocaleString()
    });
  }

  ngOnInit(): void {
    this.collaboration.getActivity(100).subscribe({
      next: (res) => {
        this.files = (res.data ?? []).filter(item => item.activityType === 'file_uploaded');
      }
    });
  }
}
