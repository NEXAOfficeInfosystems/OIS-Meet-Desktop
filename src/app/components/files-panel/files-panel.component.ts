import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { ActivityDto } from '../../core/models/collaboration.models';

@Component({
  selector: 'app-files-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files-panel.component.html',
  styleUrl: './files-panel.component.scss'
})
export class FilesPanelComponent implements OnInit {
  files: ActivityDto[] = [];

  constructor(private readonly collaboration: CollaborationService) {}

  ngOnInit(): void {
    this.collaboration.getActivity(100).subscribe({
      next: (res) => {
        this.files = (res.data ?? []).filter(item => item.activityType === 'file_uploaded');
      }
    });
  }
}
