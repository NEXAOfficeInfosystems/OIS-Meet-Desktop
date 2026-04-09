import { Injectable, signal, NgZone, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CollaborationService } from './collaboration.service';
import { CollaborationRealtimeService } from './collaboration-realtime.service';
import { StartCallRequest } from '../models/collaboration.models';
import { SignalRService } from './signalr.service';

export type CallType = 'Audio' | 'Video';

export interface IncomingCall {
  fromUserId: string;
  fromUserName: string;
  callType: CallType;
  roomId?: string;
  isMeetingInvite?: boolean;
}

export interface OutgoingCallBannerState {
  targetUserId: string;
  targetUserName: string;
  callType: CallType;
  statusText: string;
}

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private hubConnection: signalR.HubConnection | null = null;
  private ngZone = inject(NgZone);
  private collaborationService = inject(CollaborationService);
  private legacySignalRService = inject(SignalRService);
  private realtimeService = inject(CollaborationRealtimeService);

  // Reactive Signals for global access
  public incomingCall = signal<IncomingCall | null>(null);
  public isCalling = signal<boolean>(false);
  public outgoingCall = signal<OutgoingCallBannerState | null>(null);
  private currentUserId: string | null = null;
  private callAcceptedSubject = new Subject<{ byUserId: string, peerId: string, roomId: string | null }>();
  private callRejectedSubject = new Subject<{ byUserId: string, reason: string }>();
  private callEndedSubject = new Subject<string>();

  private offerSubject = new Subject<{ fromUserId: string, offer: any }>();
  private answerSubject = new Subject<{ fromUserId: string, answer: any }>();
  private iceCandidateSubject = new Subject<{ fromUserId: string, candidate: any }>();

  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  public callAccepted$ = this.callAcceptedSubject.asObservable();
  public callRejected$ = this.callRejectedSubject.asObservable();
  public callEnded$ = this.callEndedSubject.asObservable();
  public connectionState$ = this.connectionStateSubject.asObservable();

  public offer$ = this.offerSubject.asObservable();
  public answer$ = this.answerSubject.asObservable();
  public iceCandidate$ = this.iceCandidateSubject.asObservable();

  private callTimeout: any;
  private _bannerShownForCallId: string | null = null; // de-duplication key
  private ringingSound: HTMLAudioElement | null = null;
  public callStatus = signal<'Idle' | 'Calling' | 'Ringing' | 'Connected' | 'Busy' | 'Rejected'>('Idle');
  public callTypeState = signal<CallType>('Audio');

  /** The room ID returned by the API when the caller initiates a call. Used to ensure
   *  the caller opens the same LiveKit room as the callee after CallAccepted fires. */
  public activeCallRoomId: string | null = null;

  constructor() { }

  public isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  public async startConnection(userId: string): Promise<void> {
    this.currentUserId = userId;
    if (this.hubConnection && (
      this.hubConnection.state === signalR.HubConnectionState.Connected ||
      this.hubConnection.state === signalR.HubConnectionState.Connecting
    )) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    const url = `${baseUrl}/hubs/calls?userId=${encodeURIComponent(userId)}`;
    console.log(`🔌 [CallService] Initializing Call Hub for [${userId}] at: ${url}`);
    
    if (url.includes('localhost')) {
      console.warn('⚠️ [CallService] Connection is directed to LOCALHOST. Multi-machine testing will NOT work unless both machines share a remote backend server.');
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.registerOnServerEvents(this.hubConnection);

    try {
      await this.hubConnection.start();
      console.log('✅ [CallService] Call Hub Connected. Listening for IncomingCall / InviteToCall events...');
      this.connectionStateSubject.next(signalR.HubConnectionState.Connected);
    } catch (err) {
      console.error('❌ Call Hub Connection Error:', err);
      this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
      throw err;
    }
  }

  private registerOnServerEvents(hub: signalR.HubConnection): void {
    hub.onreconnecting(() => {
      this.ngZone.run(() => this.connectionStateSubject.next(signalR.HubConnectionState.Reconnecting));
    });

    hub.onreconnected(() => {
      this.ngZone.run(() => this.connectionStateSubject.next(signalR.HubConnectionState.Connected));
    });

    hub.onclose(() => {
      console.log('🔌 Call Hub Connection Closed');
      this.ngZone.run(() => this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected));
    });

    // ── ROBUST EVENT HANDLERS ───────────────────────────────────────────
    // The backend may sent positional arguments OR a single payload object.
    const handleIncomingCall = (arg1: any, arg2?: any, arg3?: any, arg4?: any) => {
      this.ngZone.run(() => {
        // Handle payload object vs positional args
        const data = (arg1 && typeof arg1 === 'object' && !arg2) ? arg1 : {
          fromUserId: arg1,
          fromUserName: arg2,
          callType: arg3,
          roomId: arg4
        };

        const fromUserId = data.fromUserId;
        const callerName = data.fromUserName || 'Inbound Call';
        const callType = data.callType || 'Video';
        const roomId = data.roomId;

        console.log(`📞 [CallHub] Incoming Call Event: From ${callerName} (${fromUserId}) Type: ${callType} Room: ${roomId}`);

        // De-duplication & Guard
        const dupeKey = `${fromUserId}::${roomId ?? ''}`;
        if (this._bannerShownForCallId === dupeKey) return;
        
        if (this.isCalling() || this.incomingCall()) {
          console.log(`🚫 Busy: Auto-rejecting call.`);
          this.rejectCall(fromUserId, 'Busy');
          return;
        }

        this._bannerShownForCallId = dupeKey;
        this.incomingCall.set({ 
          fromUserId, 
          fromUserName: callerName, 
          callType, 
          roomId, 
          isMeetingInvite: false 
        });
        
        this.playIncomingRingtone();
        if (this.callTimeout) clearTimeout(this.callTimeout);
        this.callTimeout = setTimeout(() => {
          if (this.incomingCall()?.roomId === roomId) {
            this.stopRingtones();
            this._clearIncomingCallState();
          }
        }, 60000);
      });
    };

    const handleInviteToCall = (payload: any) => {
      this.ngZone.run(() => {
        // Correctly identify targeted user and sender
        const targetUserId = payload.userId;
        const senderId = payload.fromUserId || payload.invitedBy;
        const callerName = payload.fromUserName || 'Inbound Call';
        const callType = payload.callType || 'Video';
        const roomId = payload.callId || payload.roomId;

        console.log(`📞 [CallHub] InviteToCall Event: From ${callerName} (${senderId}) Target: ${targetUserId} Room: ${roomId}`);

        // SECURITY: Only show if I am the target
        if (targetUserId && this.currentUserId && targetUserId !== this.currentUserId) {
          console.log(`⏭️ [CallHub] Skipping InviteToCall: Not intended for me (Me: ${this.currentUserId}, Target: ${targetUserId})`);
          return;
        }

        const dupeKey = `${senderId}::${roomId}`;
        if (this._bannerShownForCallId === dupeKey) return;

        this._bannerShownForCallId = dupeKey;
        this.incomingCall.set({
          fromUserId: senderId,
          fromUserName: callerName,
          callType: callType,
          roomId: roomId,
          isMeetingInvite: false
        });
        this.playIncomingRingtone();
      });
    };

    const handleIncomingMeetingInvite = (meetingId: string, fromUserName: string, fromUserId?: string) => {
      this.ngZone.run(() => {
        const hostName = fromUserName || 'Meeting Host';
        const callerId = fromUserId || 'system';
        console.log(`🚀 [CallHub/MeetingHub] Invited to join: ${meetingId} by ${hostName}`);

        const dupeKey = `system::${meetingId}`;
        if (this._bannerShownForCallId === dupeKey) return;
        this._bannerShownForCallId = dupeKey;

        this.incomingCall.set({
          fromUserId: callerId,
          fromUserName: hostName,
          callType: 'Video',
          roomId: meetingId,
          isMeetingInvite: true
        });
        
        this.playIncomingRingtone();
        if (this.callTimeout) clearTimeout(this.callTimeout);
        this.callTimeout = setTimeout(() => {
          if (this.incomingCall()) {
            this.stopRingtones();
            this._clearIncomingCallState();
          }
        }, 60000);
      });
    };

    // Register listeners for all case variants and potential event names
    hub.on('IncomingCall', handleIncomingCall);
    hub.on('incomingCall', handleIncomingCall);
    
    hub.on('InviteToCall', handleInviteToCall);
    hub.on('inviteToCall', handleInviteToCall);
    hub.on('invitetocall', handleInviteToCall);

    hub.on('InviteToMeeting', handleIncomingMeetingInvite);
    this.legacySignalRService.inviteToMeeting$.subscribe(p => p && handleIncomingMeetingInvite(p.meetingId, p.fromUserName, p.fromUserId));
    this.realtimeService.inviteToCall$.subscribe(p => p && handleInviteToCall(p));

    // Standard control events
    hub.on('CallAccepted', (byUserId, peerId) => {
      this.ngZone.run(() => {
        console.log(`✅ Call Accepted: By ${byUserId}`);
        this.stopRingtones();
        this.isCalling.set(false);
        this.callStatus.set('Connected');
        this.outgoingCall.set(null);
        this._clearIncomingCallState();
        this.callAcceptedSubject.next({ byUserId, peerId, roomId: this.activeCallRoomId });
      });
    });

    hub.on('CallRejected', (byUserId, reason) => {
      this.ngZone.run(() => {
        console.log(`❌ Call Rejected: By ${byUserId}`);
        this.stopRingtones();
        this.isCalling.set(false);
        this.callStatus.set(reason === 'Busy' ? 'Busy' : 'Rejected');
        this.outgoingCall.set(null);
        this._clearIncomingCallState();
        this.callRejectedSubject.next({ byUserId, reason });
      });
    });

    hub.on('CallEnded', (byUserId) => {
      this.ngZone.run(() => {
        console.log(`🏁 Call Ended: By ${byUserId}`);
        this.stopRingtones();
        this.isCalling.set(false);
        this.outgoingCall.set(null);
        this._clearIncomingCallState();
        this.callEndedSubject.next(byUserId);
      });
    });

    hub.on('ReceiveOffer', (fromUserId, offer) => {
      this.ngZone.run(() => this.offerSubject.next({ fromUserId, offer }));
    });

    hub.on('ReceiveAnswer', (fromUserId, answer) => {
      this.ngZone.run(() => this.answerSubject.next({ fromUserId, answer }));
    });

    hub.on('ReceiveIceCandidate', (fromUserId, candidate) => {
      this.ngZone.run(() => this.iceCandidateSubject.next({ fromUserId, candidate }));
    });

    const statusHandler = (userId: string, status: string) => {
      console.log(`👤 User status changed (CallsHub): ${userId} -> ${status}`);
    };
    hub.on('UserStatusChanged', statusHandler);
    hub.on('userStatusChanged', statusHandler);
    hub.on('userstatuschanged', statusHandler);

    // Dummy silent no-ops
    const silentNoOp = () => {};
    hub.on('CallStarted', silentNoOp);
    hub.on('callStarted', silentNoOp);
    hub.on('callstarted', silentNoOp);
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      const state = this.hubConnection?.state;

      if (state === signalR.HubConnectionState.Connecting || state === signalR.HubConnectionState.Reconnecting) {
        console.log(`Call hub is currently ${state}. Waiting for connection...`);
        let attempts = 0;
        while (!this.isConnected() && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        if (this.isConnected()) return;
      }

      if (this.currentUserId && (state === undefined || state === signalR.HubConnectionState.Disconnected)) {
        console.log('Call hub disconnected. Attempting to start connection now...');
        try {
          await this.startConnection(this.currentUserId);
          if (this.isConnected()) return;
        } catch (e) {
          console.error('Failed to start connection in ensureConnected:', e);
        }
      }

      const activeState = this.hubConnection?.state || 'Not Initialized';
      throw new Error(`Call signaling is unavailable (Status: ${activeState}). Please check your internet and try again.`);
    }
  }

  public async startCall(targetUserId: string, targetUserName: string, fromUserName: string, callType: CallType, roomId?: string): Promise<void> {
    await this.ensureConnected();
    this.isCalling.set(true);
    this.callStatus.set('Calling');
    this.callTypeState.set(callType);
    this.outgoingCall.set({
      targetUserId,
      targetUserName: targetUserName || 'participant',
      callType,
      statusText: this.isConnected() ? 'Connected' : 'Connecting... Please wait'
    });

    if (this.currentUserId) {
      const request: StartCallRequest = {
        createdBy: this.currentUserId,
        callType: callType,
        participantIds: [targetUserId],
        title: roomId ? `Meeting: ${roomId}` : `${fromUserName}'s Call`
      };

      try {
        // Step 1: Formal API Start (Handles DB creation and permission checks)
        const res = await this.collaborationService.startCall(request).toPromise();
        const activeRoomId = roomId || res?.data?.callId;
        console.log('✅ API Call Session Started:', activeRoomId);

        // Store so the caller can join the same room when CallAccepted fires.
        this.activeCallRoomId = activeRoomId ?? null;

        // Step 2: Formally invite the callee via the backend REST API
        // This securely orchestrates the SignalR push notification from the server natively
        if (activeRoomId) {
          try {
            await this.collaborationService.inviteToCall(activeRoomId, {
              userId: targetUserId,
              invitedBy: this.currentUserId
            }).toPromise();
            console.log('✅ Backend successfully processed and broadcasted the ring to target user.');
          } catch (invErr) {
            console.error('❌ Failed to push the call ring via REST API:', invErr);
          }
        }
      } catch (apiErr) {
        console.error('❌ Failed to start call via API:', apiErr);
        throw new Error('Server was unable to initiate the call session. Please try again.');
      }
    } else {
      throw new Error('User context missing. Please re-authenticate.');
    }
  }

  public setOutgoingCallDisplay(targetUserId: string, targetUserName: string, callType: CallType): void {
    this.outgoingCall.set({
      targetUserId,
      targetUserName,
      callType,
      statusText: this.isConnected() ? 'Connected' : 'Connecting... Please wait'
    });
  }

  /** Clears incoming call signal + timeout + de-duplication key atomically. */
  private _clearIncomingCallState(): void {
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
    this._bannerShownForCallId = null;
    this.incomingCall.set(null);
  }

  public async cancelOutgoingCall(): Promise<void> {
    const outgoing = this.outgoingCall();
    this.isCalling.set(false);
    this.outgoingCall.set(null);
    this.activeCallRoomId = null;

    if (!outgoing?.targetUserId) {
      return;
    }

    try {
      await this.endCall(outgoing.targetUserId);
    } catch (err) {
      console.warn('Failed to cancel outgoing call cleanly:', err);
    }
  }

  public async acceptCall(targetUserId: string): Promise<void> {
    await this.ensureConnected();
    this._clearIncomingCallState(); // Clear banner immediately on accept
    await this.hubConnection?.invoke('AcceptCall', targetUserId);
  }

  public async rejectCall(targetUserId: string, reason: string): Promise<void> {
    await this.ensureConnected();
    this._clearIncomingCallState(); // Clear banner immediately on reject
    await this.hubConnection?.invoke('RejectCall', targetUserId, reason);
  }

  public async endCall(targetUserId: string): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection?.invoke('EndCall', targetUserId);
  }

  public async sendOffer(targetUserId: string, offer: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection?.invoke('SendOffer', targetUserId, offer);
  }

  public async sendAnswer(targetUserId: string, answer: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection?.invoke('SendAnswer', targetUserId, answer);
  }

  public async sendIceCandidate(targetUserId: string, candidate: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection?.invoke('SendIceCandidate', targetUserId, candidate);
  }

  public async stopConnection(): Promise<void> {
    this.stopRingtones();
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
        console.log('Call SignalR Stopped');
      } catch (err) {
        console.error('Error stopping Call SignalR: ', err);
      } finally {
        this.hubConnection = null;
      }
    }
  }

  // --- Ringtone Logic ---

  private ringingAudioCtx: AudioContext | null = null;
  private ringingOscillators: OscillatorNode[] = [];
  private ringingIntervalId: any = null;

  private playIncomingRingtone(): void {
    this.stopRingtones();
    this.playWebAudioRingtone('incoming');
  }

  /**
   * Generates a simple phone-ring tone using the Web Audio API.
   * Incoming: two-tone ring (480 Hz + 440 Hz, ring-ring pattern)
   * Outgoing: single low tone (440 Hz, long ring)
   */
  private playWebAudioRingtone(type: 'incoming' | 'outgoing'): void {
    try {
      this.ringingAudioCtx = new AudioContext();
      const ctx = this.ringingAudioCtx;

      const playBurst = () => {
        if (!this.ringingAudioCtx || ctx.state === 'closed') return;
        const freqs = type === 'incoming' ? [480, 440] : [440];
        const osc1 = ctx.createOscillator();
        const osc2 = type === 'incoming' ? ctx.createOscillator() : null;
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.value = freqs[0];
        osc1.connect(gain);

        if (osc2) {
          osc2.type = 'sine';
          osc2.frequency.value = freqs[1];
          osc2.connect(gain);
        }

        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.8);
        if (osc2) {
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.8);
        }
        this.ringingOscillators = osc2 ? [osc1, osc2] : [osc1];
      };

      playBurst();
      const interval = type === 'incoming' ? 2000 : 3500;
      this.ringingIntervalId = setInterval(playBurst, interval);
    } catch (e) {
      console.warn('Web Audio ringtone failed:', e);
    }
  }

  public stopRingtones(): void {
    if (this.ringingSound) {
      this.ringingSound.pause();
      this.ringingSound.currentTime = 0;
      this.ringingSound = null;
    }
    if (this.ringingIntervalId !== null) {
      clearInterval(this.ringingIntervalId);
      this.ringingIntervalId = null;
    }
    this.ringingOscillators.forEach(o => { try { o.stop(); } catch { /* ignore */ } });
    this.ringingOscillators = [];
    if (this.ringingAudioCtx) {
      try { this.ringingAudioCtx.close(); } catch { /* ignore */ }
      this.ringingAudioCtx = null;
    }
  }

  // --- UI feedback (toasts) ---
  public oisToasts = signal<any[]>([]);

  public showToast(message: string, bgColor: string = '#4f46e5'): void {
    const id = Date.now().toString();
    this.oisToasts.update(current => [...current, { id, message, bgColor }]);
    setTimeout(() => {
      this.oisToasts.update(current => current.filter(t => t.id !== id));
    }, 5000);
  }
}
