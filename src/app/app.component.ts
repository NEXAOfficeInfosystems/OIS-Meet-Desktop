import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ElectronAuthService } from './core/services/electron-auth.service';
import { TitleBarComponent } from './shared/layout/title-bar/title-bar.component';
import { CommonModule } from '@angular/common';
import { CollaborationRealtimeService } from './core/services/collaboration-realtime.service';
import { NativeNotificationService } from './core/services/native-notification.service';
import { SessionService } from './core/services/session.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ois-meet-desktop';
  isElectron = !!(window as any).windowAPI;
  constructor(
    private _electronAuth: ElectronAuthService,
    private realtime: CollaborationRealtimeService,
    private notifications: NativeNotificationService,
    private session: SessionService
  ) {
    // Inject to ensure ElectronAuthService is instantiated early
    this.notifications.requestPermission();
    this.realtime.start(this.session.getOISMeetUserId() || this.session.getUserId());
    window.addEventListener('auth-restored', () => {
      this.realtime.start(this.session.getOISMeetUserId() || this.session.getUserId());
    });
    this.realtime.notificationReceived$.subscribe(notification => {
      if (notification?.title) {
        this.notifications.notify(notification.title, notification.body || 'New notification');
      }
    });
    this.realtime.inviteToCall$.subscribe(invite => {
      if (invite?.callId) {
        this.notifications.notify('Incoming call', `You were invited to call ${invite.callId}`);
      }
    });
  }
}
