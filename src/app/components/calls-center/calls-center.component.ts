import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';
import { CollaborationRealtimeService } from '../../core/services/collaboration-realtime.service';
import { CollaborationService } from '../../core/services/collaboration.service';
import { SessionService } from '../../core/services/session.service';
import { CallSessionDto } from '../../core/models/collaboration.models';
import { LivekitService } from '../../core/services/livekit.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-calls-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calls-center.component.html',
  styleUrl: './calls-center.component.scss'
})
export class CallsCenterComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;

  currentCall?: CallSessionDto;
  invitedCallId = '';
  loading = false;
  connecting = false;
  livekitConnected = false;
  activeCallId = '';
  isMuted = false;
  cameraOn = true;
  screenSharing = false;
  statusText = 'Ready';

  private localStream: MediaStream | null = null;
  private screenShareTrackSid: string | null = null;
  private isStartingScreenShare = false;
  private readonly subs = new Subscription();

  constructor(
    private readonly collaboration: CollaborationService,
    private readonly realtime: CollaborationRealtimeService,
    private readonly session: SessionService,
    private readonly livekit: LivekitService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.realtime.start();
    this.subs.add(this.realtime.inviteToCall$.subscribe(payload => {
      if (payload?.callId) {
        this.invitedCallId = payload.callId;
      }
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    void this.leaveActiveCall();
  }

  async startQuickCall(): Promise<void> {
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (!userId) return;

    this.loading = true;
    this.statusText = 'Creating call...';

    this.collaboration.startCall({
      createdBy: userId,
      title: 'Team call',
      callType: 'Group',
      participantIds: [userId]
    }).subscribe({
      next: async (res) => {
        const callId = res.data?.callId;
        this.loading = false;
        if (callId) {
          await this.joinCall(callId);
        }
      },
      error: () => {
        this.loading = false;
        this.statusText = 'Failed to create call';
      }
    });
  }

  async joinInvitedCall(): Promise<void> {
    if (!this.invitedCallId) return;
    await this.joinCall(this.invitedCallId);
  }

  async joinCall(callId: string): Promise<void> {
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (!userId) return;

    const userName = this.session.getFullName() || 'User';
    this.connecting = true;
    this.statusText = `Joining ${callId}...`;

    try {
      await firstValueFrom(this.collaboration.joinCall(callId, { userId, userName }));
      const call = await firstValueFrom(this.collaboration.getCall(callId));
      this.currentCall = call.data;

      const tokenResponse = await firstValueFrom(this.collaboration.getCallLivekitToken(callId, userId, userName));
      const token = tokenResponse.data?.token;
      const livekitUrl = tokenResponse.data?.livekitUrl || environment.livekitUrl;
      const roomName = tokenResponse.data?.roomName || `call-${callId}`;

      if (!token) {
        throw new Error('LiveKit token missing');
      }

      await this.livekit.connect(livekitUrl, token);
      this.livekitConnected = true;
      this.activeCallId = callId;
      this.statusText = `Connected to ${roomName}`;
      await this.attachLocalMedia();
      await this.realtime.joinCall(callId);
    } catch (err) {
      console.error('joinCall failed', err);
      this.statusText = 'Failed to join LiveKit room';
      this.connecting = false;
      return;
    }

    this.connecting = false;
  }

  async leaveCall(callId: string): Promise<void> {
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    if (!userId) return;

    await this.leaveActiveCall();
    this.collaboration.leaveCall(callId, { userId, userName: this.session.getFullName() || 'User' })
      .subscribe(() => this.realtime.leaveCall(callId));
  }

  async endCurrentCall(): Promise<void> {
    if (!this.activeCallId) return;
    await this.leaveActiveCall();
    this.collaboration.endCall(this.activeCallId).subscribe();
  }

  async toggleMute(): Promise<void> {
    this.isMuted = !this.isMuted;
    const audioTrack = this.localStream?.getAudioTracks()[0] || null;
    await this.livekit.setMicrophoneMuted(this.isMuted, audioTrack);
  }

  async toggleCamera(): Promise<void> {
    this.cameraOn = !this.cameraOn;
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = this.cameraOn;
    }
  }

   async toggleScreenShare(): Promise<void> {
    if (!this.activeCallId || this.isStartingScreenShare) return;

    if (!this.screenSharing) {
      try {
        this.isStartingScreenShare = true;
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        this.isStartingScreenShare = false;
        
        const track = stream.getVideoTracks()[0];
        this.screenShareTrackSid = await this.livekit.publishScreenShareTrack(track);
        this.screenSharing = true;
        track.onended = () => void this.stopScreenShare();
      } catch (err) {
        this.isStartingScreenShare = false;
        console.error('Screen share failed', err);
      }
      return;
    }

    await this.stopScreenShare();
  }

  private async stopScreenShare(): Promise<void> {
    if (this.screenShareTrackSid) {
      await this.livekit.unpublishTrack(this.screenShareTrackSid);
      this.screenShareTrackSid = null;
    }
    this.screenSharing = false;
  }

  private async attachLocalMedia(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

    if (this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = this.localStream;
    }

    const audioTrack = this.localStream.getAudioTracks()[0] || null;
    const videoTrack = this.localStream.getVideoTracks()[0] || null;

    if (audioTrack) {
      await this.livekit.publishMicrophoneTrack(audioTrack);
    }
    if (videoTrack) {
      await this.livekit.publishCameraTrack(videoTrack);
    }
  }

  private async leaveActiveCall(): Promise<void> {
    if (!this.activeCallId && !this.livekitConnected) {
      return;
    }

    const callId = this.activeCallId;
    const userId = this.session.getOISMeetUserId() || this.session.getUserId();
    const userName = this.session.getFullName() || 'User';

    try {
      if (callId && userId) {
        await firstValueFrom(this.collaboration.leaveCall(callId, { userId, userName }));
        await this.realtime.leaveCall(callId);
      }
    } catch {
      // ignore
    }

    await this.stopScreenShare();
    await this.livekit.unpublishCameraTracks();
    await this.livekit.unpublishMicrophoneTracks();
    await this.livekit.disconnect();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.livekitConnected = false;
    this.activeCallId = '';
    this.cameraOn = true;
    this.isMuted = false;
    this.connecting = false;
    this.statusText = 'Ready';
  }
}

