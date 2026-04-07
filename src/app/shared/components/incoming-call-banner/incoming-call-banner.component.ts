import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService } from '../../../core/services/call.service';
import { SessionService } from '../../../core/services/session.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-incoming-call-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="call-banner shadow-lg animate-in" *ngIf="callService.incomingCall() as call">
      <div class="banner-content">
        <div class="user-avatar" [style.background-color]="'#4f46e5'">
          {{ call.fromUserName.charAt(0).toUpperCase() }}
        </div>
        <div class="call-info">
          <span class="user-name">{{ call.fromUserName }}</span>
          <span class="call-type">{{ call.roomId ? 'Meeting Invite' : 'Incoming ' + call.callType + ' Call' }}</span>
        </div>
        <div class="actions">
          <button class="btn-action reject" (click)="reject()" title="Reject">
            <i class="bi bi-telephone-x-fill"></i>
          </button>
          <button class="btn-action accept" (click)="accept()" title="Accept">
            <i class="bi bi-telephone-fill"></i>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .call-banner {
      position: fixed;
      top: 60px; /* Below title bar */
      left: 50%;
      transform: translateX(-50%);
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 20px;
      z-index: 10000;
      width: 420px;
      max-width: 90vw;
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .user-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 18px;
    }

    .call-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      
      .user-name {
        font-weight: 700;
        color: #1a202c;
        font-size: 15px;
      }
      .call-type {
        font-size: 13px;
        color: #718096;
      }
    }

    .actions {
      display: flex;
      gap: 12px;
    }

    .btn-action {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: pointer;
      transition: transform 0.2s;

      &:hover {
        transform: scale(1.1);
      }

      &.reject { background: #ef4444; }
      &.accept { background: #10b981; }
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

    if (call.roomId) {
      // Meeting invite
      this.openMeetingWindow(call.roomId, false, call.callType === 'Video');
    } else {
      // 1:1 Call
      this.callService.acceptCall(call.fromUserId);
      const sorted = [this.sessionService.getOISMeetUserId(), call.fromUserId].sort();
      const roomId = `call_${sorted[0]}_${sorted[1]}`;
      this.openMeetingWindow(roomId, false, call.callType === 'Video');
    }
    
    this.callService.incomingCall.set(null);
  }

  reject(): void {
    const call = this.callService.incomingCall();
    if (call && !call.roomId) {
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

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron) {
      electronApi.openMeetingWindow({
        routePath: `/meeting/${meetingId}`,
        queryString: params.toString(),
      });
    } else {
      window.open(`/meeting/${meetingId}?${params}`, '_blank', 'width=1280,height=800');
    }
  }
}
