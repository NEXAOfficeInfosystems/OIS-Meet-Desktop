import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  userFullName: string | null = null;
  
  recentChats = [
    { name: 'Jane Smith', status: 'Online', lastMsg: 'I will send the files by 5 PM.', time: '10:45 AM', avatar: 'assets/header/profile.png' },
    { name: 'Michael Lee', status: 'Busy', lastMsg: 'Can we reschedule the sync?', time: '9:47 AM', avatar: 'assets/header/profile.png' },
    { name: 'Group Project', status: '', lastMsg: 'Ellen: Great work everyone!', time: '8:25 AM', avatar: 'assets/header/profile.png' },
    { name: 'Sarah Johnson', status: 'Away', lastMsg: 'See you at the meeting!', time: '5:12 PM', avatar: 'assets/header/profile.png' },
  ];

  participants = [
    { name: 'Jane Smith', avatar: 'assets/header/profile.png', audio: true, video: true },
    { name: 'Michael Lee', avatar: 'assets/header/profile.png', audio: false, video: true },
    { name: 'Sarah Johnson', avatar: 'assets/header/profile.png', audio: true, video: true },
    { name: 'David Williams', avatar: 'assets/header/profile.png', audio: true, video: false },
    { name: 'John Doe (You)', avatar: 'assets/header/profile.png', audio: true, video: true },
    { name: 'Emily Clark', avatar: 'assets/header/profile.png', audio: false, video: false },
    { name: 'Chris Evans', avatar: 'assets/header/profile.png', audio: true, video: true },
    { name: 'Robert Downey', avatar: 'assets/header/profile.png', audio: true, video: true },
  ];

  calendarEvents = [
    { title: 'Marketing Sync', time: '9:00 AM', color: '#2563EB' },
    { title: 'UX Design Review', time: '1:30 PM', color: '#7C3AED' },
    { title: 'Sprint Planning', time: '10:00 AM', color: '#107C10' },
    { title: 'Project Presentation', time: '2:00 PM', color: '#D13438' },
  ];

  activityFeed = [
    { text: 'Product Demo is starting now', time: '10:00 AM', icon: 'bi bi-play-circle' },
    { text: 'Marketing Sync starts in 1 hour', time: '8:00 AM', icon: 'bi bi-clock' },
    { text: 'Sprint Planning rescheduled', time: '10:00 AM', icon: 'bi bi-calendar-event' },
    { text: 'Project Presentation ready', time: '2:13 PM', icon: 'bi bi-file-earmark-check' },
  ];

  contacts = [
    { name: 'Jane Smith', status: 'Online', avatar: 'assets/header/profile.png' },
    { name: 'Michael Lee', status: 'Busy', avatar: 'assets/header/profile.png' },
    { name: 'Sarah Johnson', status: 'Away', avatar: 'assets/header/profile.png' },
    { name: 'Emily Clark', status: 'Offline', avatar: 'assets/header/profile.png' },
  ];

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#0078d4', '#107c10', '#d13438', '#0078d4', '#4f6bed', '#00bcf2', '#881798'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.userFullName = this.sessionService.getFullName();
  }

  startNewMeeting() {
    this.navigateTo('/meeting');
  }

  joinMeeting() {
    this.navigateTo('/join-meeting');
  }

  navigateTo(route: string) {
    this.router.navigateByUrl(route);
  }
}
