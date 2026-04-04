import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  public activeTab: string = 'dashboard';
  constructor(
    private router: Router
  ) {
    this.setActiveTab(this.activeTab)
  }

  public setActiveTab(tab: string): void {
    this.activeTab = tab;
    const routeMap: Record<string, string> = {
      dashboard: '/dashboard',
      activity: '/activity',
      chat: '/chat',
      teams: '/teams',
      calendar: '/coming-soon',
      calls: '/calls',
      files: '/files',
      notifications: '/notifications',
      settings: '/settings',
      help: '/coming-soon',
      apps: '/coming-soon'
    };

    this.router.navigate([routeMap[tab] ?? '/dashboard']);
  }
}
