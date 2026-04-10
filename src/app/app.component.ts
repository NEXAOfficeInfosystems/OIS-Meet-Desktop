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
import { SignalRService } from './core/services/signalr.service';


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
        <div class="global-call-banner__title">
          <span *ngIf="callService.callStatus() === 'Calling'">Calling {{ call.targetUserName }}...</span>
          <span *ngIf="callService.callStatus() === 'Ringing'">{{ call.targetUserName }} is ringing...</span>
          <span *ngIf="callService.callStatus() === 'Connected'">Connected to {{ call.targetUserName }}</span>
          <span *ngIf="callService.callStatus() === 'Busy'">{{ call.targetUserName }} is busy</span>
          <span *ngIf="callService.callStatus() === 'Rejected'">Call declined</span>
        </div>
        <div class="global-call-banner__meta">
          {{ call.callType }} call · {{ getOutgoingCallStatusText() }}
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

  private _theme: 'light' | 'dark' = 'light';

  constructor(
    private _electronAuth: ElectronAuthService,
    private auth: AuthService,
    private realtime: CollaborationRealtimeService,
    private notifications: NativeNotificationService,
    private session: SessionService,
    public callService: CallService,
    private signalRService: SignalRService
  ) {
    // ── THEME INITIALIZATION ──
    this._initializeTheme();

    // Trigger browser notification and focus window when a call arrives —
    // only for the CALLEE (not the caller, who already has the outgoing banner).
    effect(() => {
      const call = this.callService.incomingCall();
      if (!call) return;

      // Callee-only guard: resolve current user and compare against caller.
      const currentUserId = this.session.getOISMeetUserId() || this.session.getUserId();
      if (currentUserId && call.fromUserId !== 'system' && call.fromUserId === currentUserId) {
        // Current client IS the caller — skip notification and window focus.
        console.warn('[AppComponent] Suppressing notification effect – current user is the caller.');
        return;
      }

      // Show OS-level notification for the callee.
      this.notifications.notify(
        call.isMeetingInvite ? 'Meeting Invite' : 'Incoming Call',
        `${call.fromUserName} is inviting you...`
      );

      // Focus the application window so the user sees the incoming call banner.
      if (this.isElectron && (window as any).windowAPI?.focus) {
        (window as any).windowAPI.focus();
      }
    });

    let activeConnectionUserId: string | null = null;
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (userId) {
      // userId available immediately (web/non-Electron) — start now.
      activeConnectionUserId = userId;
      this.realtime.start(userId);
      this.callService.startConnection(userId);
      this.signalRService.startConnection(userId);
    } else {
      // userId not yet available (Electron: auth hasn't been restored yet).
      // The 'auth-restored' event below will handle start-up.
      console.log('[AppComponent] userId not yet available — waiting for auth-restored event to start Call Hub.');
    }

    // When the main window is hidden to the system tray there is no visible UI to
    // accept or dismiss an incoming call, so stop the ringtone immediately.
    window.addEventListener('ois-window-hidden', () => {
      this.callService.stopRingtones();
    });

    // In Electron, auth data is restored asynchronously after the app loads.
    // When it arrives, stop any stale connection (connected with null userId) and
    // reconnect with the real userId so the server can route IncomingCall events.
    window.addEventListener('auth-restored', async () => {
      const restoredUserId = this.session.getOISMeetUserId() || this.session.getUserId();
      if (restoredUserId && restoredUserId !== activeConnectionUserId) {
        console.log(`[AppComponent] auth-restored: (re)starting services with new userId=${restoredUserId}`);
        activeConnectionUserId = restoredUserId;
        this.realtime.start(restoredUserId);

        // Stop any existing call hub connection and reconnect with the confirmed identity.
        await this.callService.stopConnection();
        this.callService.startConnection(restoredUserId);
        this.signalRService.startConnection(restoredUserId);
      } else if (restoredUserId === activeConnectionUserId) {
        console.log('[AppComponent] auth-restored: userId matches active connection. Resuming logic skipped to prevent interruption.');
      }
    });

    this.realtime.notificationReceived$.subscribe(notification => {
      if (notification?.title) {
        // Skip call/meeting notifications: they are already handled by the
        // incomingCall signal effect above, which shows exactly one OS notification.
        const callTypes = ['IncomingCall', 'InviteToCall', 'InviteToMeeting', 'CallInvite', 'MeetingInvite'];
        const isCallNotification = callTypes.some(t =>
          notification.type?.toLowerCase().includes(t.toLowerCase()) ||
          notification.entityType?.toLowerCase().includes('call') ||
          notification.entityType?.toLowerCase().includes('meeting')
        );
        if (isCallNotification) {
          console.log('🔕 Suppressing duplicate call/meeting OS notification from generic handler:', notification.type);
          return;
        }
        console.log('🔔 Generic Notification Received:', notification.title);
        this.notifications.notify(notification.title, notification.body || 'New notification');
      }
    });
  }

  private _initializeTheme(): void {
    const saved = localStorage.getItem('ois.theme') as 'light' | 'dark' | null;
    this._theme = saved || 'light';
    this._applyTheme();

    // Listen for theme changes from TitleBar or other components
    window.addEventListener('ois-theme-changed', (e: any) => {
      this._theme = (e as CustomEvent).detail;
      this._applyTheme();
    });
  }

  private _applyTheme(): void {
    const body = document.body;
    body.classList.toggle('theme-dark', this._theme === 'dark');
    body.classList.toggle('theme-light', this._theme === 'light');
    // Force background color for the body to match theme
    body.style.backgroundColor = this._theme === 'dark' ? '#111111' : '#ffffff';
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
