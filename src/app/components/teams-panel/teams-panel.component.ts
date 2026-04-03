import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CollaborationService } from '../../core/services/collaboration.service';
import { TeamDto } from '../../core/models/collaboration.models';

@Component({
  selector: 'app-teams-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teams-panel.component.html',
  styleUrl: './teams-panel.component.scss'
})
export class TeamsPanelComponent implements OnInit {
  teams: TeamDto[] = [];
  loading = true;

  constructor(private readonly collaboration: CollaborationService) {}

  ngOnInit(): void {
    this.collaboration.getTeams().subscribe({
      next: (res) => {
        this.teams = res.data ?? [];
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }
}
