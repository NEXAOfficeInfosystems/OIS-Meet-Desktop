import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService } from '../../../core/services/call.service';
import { SessionService } from '../../../core/services/session.service';
import { Router } from '@angular/router';
import { InitialsPipe } from '../../../shared/pipes/initials.pipe';

@Component({
  selector: 'app-incoming-call-banner',
  standalone: true,
  imports: [CommonModule, InitialsPipe],
  template: `
    <!--
      CALLEE-ONLY BANNER: Rendered only when:
        1. There is an active incomingCall signal set by the service
        2. AND the current logged-in user is NOT the caller (defense-in-depth guard)
    -->
    <div class="global-call-banner shadow-lg animate-in" *ngIf="showBanner() as call">
      <div class="global-call-banner__icon">
        <div class="avatar-circle">
          {{ call.fromUserName | initials }}
        </div>
      </div>
      <div class="global-call-banner__content">
        <div class="global-call-banner__title">{{ call.fromUserName }}</div>
        <div class="global-call-banner__meta">
          {{ call.isMeetingInvite ? 'Meeting Invite' : 'Incoming ' + call.callType + ' Call' }}
        </div>
      </div>
      <div class="global-call-banner__actions">
        <button class="action-btn action-btn--reject" type="button" (click)="reject()">
          Decline
        </button>
        <button class="action-btn action-btn--accept" type="button" (click)="accept()">
          Accept
        </button>
      </div>
    </div>
  `,
  styles: [`
    .global-call-banner {
      position: fixed;
      top: 58px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10950;
      width: min(720px, calc(100vw - 32px));
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      border: 1px solid #dbe7f7;
      border-radius: 14px;
      background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
    }

    .global-call-banner__icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: 1px solid #dbe7f7;
      flex-shrink: 0;
    }

    .avatar-circle {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #4f46e5;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.1rem;
    }

    .global-call-banner__content {
      min-width: 0;
      flex: 1;
    }

    .global-call-banner__title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #1e293b;
    }

    .global-call-banner__meta {
      font-size: 0.8rem;
      color: #64748b;
    }

    .global-call-banner__actions {
      display: flex;
      gap: 10px;
    }

    .action-btn {
      border-radius: 999px;
      padding: 8px 16px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }

    .action-btn--reject {
      border-color: #ef4444;
      background: #ffffff;
      color: #dc2626;

      &:hover {
        background: #fef2f2;
      }
    }

    .action-btn--accept {
      background: #10b981;
      color: #ffffff;

      &:hover {
        background: #059669;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
      }
    }

    .animate-in {
      animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes slideDown {
      from { transform: translate(-50%, -100%); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
  `]
})
export class IncomingCallBannerComponent {
  public callService = inject(CallService);
  private sessionService = inject(SessionService);
  private router = inject(Router);

  /**
   * Returns the incoming call only when the current user is the callee.
   * This is a defense-in-depth check — the primary guard lives in CallService.
   * Returns null (falsy) if the current user IS the caller, suppressing the banner.
   */
  public showBanner = computed(() => {
    const call = this.callService.incomingCall();
    if (!call) return null;

    const currentUserId = this.sessionService.getOISMeetUserId() || this.sessionService.getUserId();

    // If we can identify the current user AND they are the caller → suppress.
    if (currentUserId && call.fromUserId !== 'system' && call.fromUserId === currentUserId) {
      console.warn('[IncomingCallBanner] Defense-in-depth: suppressing banner – current user is the caller.');
      return null;
    }

    return call;
  });

  async accept(): Promise<void> {
    const call = this.callService.incomingCall();
    if (!call) return;

    // Check if a meeting is already active in Electron
    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.isMeetingActive === 'function') {
      const isActive = await electronApi.isMeetingActive();
      if (isActive) {
        this.callService.showToast('You are already in an active meeting. Please leave it before joining another.', '#ef4444');
        return;
      }
    }

    if (call.isMeetingInvite) {
      // Meeting invite
      this.openMeetingWindow(call.roomId || '', false, call.callType === 'Video');
    } else {
      // 1:1 Call
      await this.callService.acceptCall(call.fromUserId);

      const currentUserId = this.sessionService.getOISMeetUserId() || this.sessionService.getUserId();
      const sorted = [currentUserId, call.fromUserId].sort();
      const roomId = call.roomId || `call_${sorted?.[0]}_${sorted?.[1]}`;

      this.openMeetingWindow(roomId, false, call.callType === 'Video');
    }

    this.callService.incomingCall.set(null);
  }

  reject(): void {
    const call = this.callService.incomingCall();
    if (call && !call.isMeetingInvite) {
      this.callService.rejectCall(call.fromUserId, 'Busy');
    }
    this.callService.incomingCall.set(null);
  }

  private openMeetingWindow(meetingId: string, isHost: boolean, cam = false): void {
    const params = new URLSearchParams({
      host: String(isHost),
      topic: 'OIS Meet',
      mic: 'true',
      cam: String(cam),
    });

    const desktopApi = (window as any).oisMeet;
    if (desktopApi && typeof desktopApi.openMeetingWindow === 'function') {
      desktopApi.openMeetingWindow({
        routePath: `/meeting/${meetingId}`,
        queryString: params.toString(),
      });
    } else {
      window.open(`/meeting/${meetingId}?${params}`, '_blank', 'width=1280,height=800');
    }
  }
}
