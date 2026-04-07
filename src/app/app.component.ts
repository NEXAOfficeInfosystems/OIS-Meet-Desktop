import { Component, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ElectronAuthService } from './core/services/electron-auth.service';
import { TitleBarComponent } from './shared/layout/title-bar/title-bar.component';
import { CommonModule } from '@angular/common';
import { CollaborationRealtimeService } from './core/services/collaboration-realtime.service';
import { NativeNotificationService } from './core/services/native-notification.service';
import { SessionService } from './core/services/session.service';
import { IncomingCallBannerComponent } from './shared/components/incoming-call-banner/incoming-call-banner.component';
import { CallService } from './core/services/call.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/services/auth.service';
import { computed, inject } from '@angular/core';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, CommonModule, IncomingCallBannerComponent],
  template: `
    <app-title-bar *ngIf="isElectron || isAuthenticated()"></app-title-bar>
    <app-incoming-call-banner></app-incoming-call-banner>
    
    <!-- Global Toast Container -->
    <div class="global-toasts">
      <div class="ois-toast" *ngFor="let toast of callService.oisToasts()" 
           [style.background-color]="toast.bgColor">
        {{ toast.message }}
      </div>
    </div>

    <div class="main-content" [class.with-title-bar]="isElectron || isAuthenticated()">
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ois-meet-desktop';
  isElectron = !!(window as any).windowAPI;
  private auth = inject(AuthService);
  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  constructor(
    private _electronAuth: ElectronAuthService,
    private realtime: CollaborationRealtimeService,
    private notifications: NativeNotificationService,
    private session: SessionService,
    public callService: CallService
  ) {
    // Inject to ensure ElectronAuthService is instantiated early
    this.notifications.requestPermission();

    // Trigger browser notification when a call arrives via Signal effect
    effect(() => {
      const call = this.callService.incomingCall();
      if (call) {
        this.notifications.notify(
          call.roomId ? 'Meeting Invite' : 'Incoming Call',
          `${call.fromUserName} is inviting you...`
        );
      }
    });
    
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (userId) {
      this.realtime.start(userId);
      this.callService.startConnection(userId);
    }

    window.addEventListener('auth-restored', () => {
      const restoredUserId = this.session.getOISMeetUserId() || this.session.getUserId();
      if (restoredUserId) {
        this.realtime.start(restoredUserId);
        this.callService.startConnection(restoredUserId);
      }
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
