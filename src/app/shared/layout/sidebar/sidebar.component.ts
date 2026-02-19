import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  public activeTab: string = 'chat';
  constructor(
    private router: Router
  ) {
    this.setActiveTab(this.activeTab)
  }

  public setActiveTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'chat') {
      this.router.navigate(['/chat']);
    } else{
      this.router.navigate(['/coming-soon']);
    }
  }
}
