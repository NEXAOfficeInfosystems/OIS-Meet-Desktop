import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  userFullName: string | null = null;
  applicationName: string | null = null;
  greeting = 'Morning';

  stats = [
    { label: 'Meetings Today',  value: '3',  icon: 'bi bi-camera-video-fill', color: '#0b57d0', bg: '#e8f0fe' },
    { label: 'Unread Messages', value: '12', icon: 'bi bi-chat-dots-fill',   color: '#1e7e34', bg: '#d4edda' },
    { label: 'Active Contacts', value: '48', icon: 'bi bi-people-fill',      color: '#7c3aed', bg: '#ede9fe' },
    { label: 'Files Shared',    value: '7',  icon: 'bi bi-folder2-open',     color: '#b45309', bg: '#fef3c7' },
  ];

  upcomingMeetings = [
    { title: 'Q2 Product Review',     host: 'Hosted by Senthil Kumar',   time: '10:00 AM', date: 'Today',    type: 'Video', participants: 8  },
    { title: 'Design Sprint Kickoff', host: 'Hosted by Deepak Kamaraj', time: '02:30 PM', date: 'Today',    type: 'Video', participants: 5  },
    { title: 'Client Sync — OIS',     host: 'Hosted by Gowtham K',      time: '09:00 AM', date: 'Tomorrow', type: 'Audio', participants: 12 },
  ];

  quickLinks = [
    { label: 'Chat',      icon: 'bi bi-chat-dots-fill',   color: '#0b57d0', bg: '#e8f0fe', route: '/chat'        },
    { label: 'Calls',     icon: 'bi bi-telephone-fill',   color: '#1e7e34', bg: '#d4edda', route: '/calls'       },
    { label: 'Teams',     icon: 'bi bi-people-fill',      color: '#7c3aed', bg: '#ede9fe', route: '/teams'       },
    { label: 'Files',     icon: 'bi bi-folder2-open',     color: '#b45309', bg: '#fef3c7', route: '/files'       },
    { label: 'Activity',  icon: 'bi bi-bell-fill',        color: '#0891b2', bg: '#e0f2fe', route: '/activity'    },
    { label: 'Calendar',  icon: 'bi bi-calendar-check',   color: '#be123c', bg: '#ffe4e6', route: '/coming-soon' },
  ];

  recentActivity = [
    { initials: 'DK', color: '#6366f1', text: '<b>Deepak Kamaraj</b> sent you a message',         time: '2m ago'   },
    { initials: 'GK', color: '#10b981', text: '<b>Gowtham K</b> joined the <b>General</b> channel', time: '14m ago'  },
    { initials: 'SK', color: '#f59e0b', text: '<b>Sasi Kumar</b> shared a file: <b>Q2_Report.pdf</b>', time: '1h ago'   },
    { initials: 'RC', color: '#ef4444', text: '<b>Ranjith C A</b> started a meeting',             time: '2h ago'   },
    { initials: 'JV', color: '#8b5cf6', text: '<b>Joseph Vijay</b> reacted to your message 👍',   time: 'Yesterday' },
  ];

  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.userFullName = this.sessionService.getFullName();
    this.applicationName = this.sessionService.getApplicationName();
    this.setGreeting();
  }

  private setGreeting() {
    const h = new Date().getHours();
    this.greeting = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  }

  gotoLandingPage() {
    this.router.navigateByUrl('/landing');
  }

  joinMeeting() {
    this.router.navigateByUrl('/join-meeting');
  }

  scheduleMeeting() {
    this.router.navigateByUrl('/coming-soon');
  }

  navigateTo(route: string) {
    this.router.navigateByUrl(route);
  }

  logout() {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
