import { Component } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  public activeTab: string = 'chat';

  public setActiveTab(tab: string): void {
    this.activeTab = tab;
  }
}
