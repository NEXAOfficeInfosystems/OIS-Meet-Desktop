import { Component, model } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-activity-detail-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-detail-tabs.component.html',
  styleUrl: './activity-detail-tabs.component.scss'
})
export class ActivityDetailTabsComponent {
  activeTab = model<'chat' | 'shared'>('chat');

  setTab(tab: 'chat' | 'shared') {
    this.activeTab.set(tab);
  }
}
