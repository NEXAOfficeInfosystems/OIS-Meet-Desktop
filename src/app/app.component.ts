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
import * as signalR from '@microsoft/signalr';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, CommonModule, IncomingCallBannerComponent],
  template: `
    <app-title-bar *ngIf="isElectron || isAuthenticated()"></app-title-bar>
    <app-incoming-call-banner></app-incoming-call-banner>
    <div class="global-call-banner" *ngIf="callService.outgoingCall() as call">
      <div class="global-call-banner__icon">
        <div class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></div>
      </div>
      <div class="global-call-banner__content">
        <div class="global-call-banner__title">Calling {{ call.targetUserName }}</div>
        <div class="global-call-banner__meta">
          {{ call.callType }} call in progress - {{ getOutgoingCallStatusText() }}
        </div>
      </div>
      <button class="global-call-banner__cancel" type="button" (click)="cancelOutgoingCall()">
        Cancel
      </button>
    </div>
    
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
  isAuthenticated = toSignal(this.auth.isAuthenticated$, { initialValue: false });
  callConnectionState = toSignal(this.callService.connectionState$, {
    initialValue: signalR.HubConnectionState.Disconnected
  });

  constructor(
    private _electronAuth: ElectronAuthService,
    private auth: AuthService,
    private realtime: CollaborationRealtimeService,
    private notifications: NativeNotificationService,
    private session: SessionService,
    public callService: CallService
  ) {
    // Inject to ensure ElectronAuthService is instantiated early
    this.notifications.requestPermission();

    // Trigger browser notification and focus window when a call arrives
    effect(() => {
      const call = this.callService.incomingCall();
      if (call) {
        // Show notification
        this.notifications.notify(
          call.isMeetingInvite ? 'Meeting Invite' : 'Incoming Call',
          `${call.fromUserName} is inviting you...`
        );

        // Focus the application window so the user sees the incoming call banner
        if (this.isElectron && (window as any).windowAPI?.focus) {
          (window as any).windowAPI.focus();
        }
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
        console.log('🔔 Generic Notification Received:', notification.title);
        this.notifications.notify(notification.title, notification.body || 'New notification');
      }
    });

    // Note: Removed redundant realtime.inviteToCall$ subscription here.
    // Call invitations are now handled centrally via CallService to ensure the UI banner is triggered.
  }

  getOutgoingCallStatusText(): string {
    const state = this.callConnectionState();

    if (state === signalR.HubConnectionState.Connected) {
      return 'Connected';
    }

    if (state === signalR.HubConnectionState.Reconnecting) {
      return 'Reconnecting... Please wait';
    }

    return 'Connecting... Please wait';
  }

  cancelOutgoingCall(): void {
    void this.callService.cancelOutgoingCall();
  }
}
