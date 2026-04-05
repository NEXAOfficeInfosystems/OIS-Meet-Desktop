import { Component, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SessionService } from '../../../core/services/session.service';
import { CommonService } from '../../../core/services/common.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  private sessionService = inject(SessionService);
  private commonService = inject(CommonService);
  private router = inject(Router);

  isCollapsed = toSignal(this.commonService.isSidebarCollapsed$, { initialValue: false });

  public activeTab: string = 'dashboard';
  public userFullName: string = this.sessionService.getFullName() || 'John Doe';
  public userEmail: string = 'john.doe@example.com'; // Placeholder, standard for the mockup
  
  constructor() {
    // Determine active tab from current URL
    const url = this.router.url;
    if (url.includes('chat')) this.activeTab = 'chat';
    else if (url.includes('calendar')) this.activeTab = 'calendar';
    else if (url.includes('activity')) this.activeTab = 'activity';
    else if (url.includes('settings')) this.activeTab = 'settings';
    else if (url.includes('landing') || url.includes('join-meeting')) this.activeTab = 'meetings';
    else this.activeTab = 'dashboard';
  }

  public setActiveTab(tab: string): void {
    this.activeTab = tab;
    const routeMap: Record<string, string> = {
      dashboard: '/dashboard',
      activity: '/activity',
      chat: '/chat',
      meetings: '/landing',
      calendar: '/calendar',
      contacts: '/coming-soon',
      settings: '/settings',
      upgrade: '/coming-soon'
    };

    if (routeMap[tab]) {
      this.router.navigate([routeMap[tab]]);
    }
  }
}
