import { Injectable, signal, NgZone, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CollaborationService } from './collaboration.service';
import { StartCallRequest } from '../models/collaboration.models';

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
  
  // Reactive Signals for global access
  public incomingCall = signal<IncomingCall | null>(null);
  public isCalling = signal<boolean>(false);
  public outgoingCall = signal<OutgoingCallBannerState | null>(null);
  private currentUserId: string | null = null;
  
  private callAcceptedSubject = new Subject<{ byUserId: string, peerId: string }>();
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

  constructor() {}

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
    console.log(`🔌 Initializing Call Hub at: ${url}`);

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.registerOnServerEvents(this.hubConnection);

    try {
      await this.hubConnection.start();
      console.log('✅ Call Signaling Hub Connected');
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

    hub.on('IncomingCall', (fromUserId, fromUserName, callType, roomId) => {
      this.ngZone.run(() => {
        console.log(`📞 Incoming Call banner: From ${fromUserName} (${fromUserId}) Type: ${callType} Room: ${roomId}`);
        this.incomingCall.set({ fromUserId, fromUserName, callType, roomId, isMeetingInvite: false });

        if (this.callTimeout) clearTimeout(this.callTimeout);
        this.callTimeout = setTimeout(() => {
          if (this.incomingCall()) {
            this.rejectCall(fromUserId, 'Timed out');
            this.incomingCall.set(null);
          }
        }, 60000);
      });
    });

    hub.on('InviteToCall', (payload: { userId: string; callId: string; fromUserName?: string }) => {
      this.ngZone.run(() => {
        console.log(`📞 Received InviteToCall: ${payload.callId} From: ${payload.fromUserName}`);
        this.incomingCall.set({
          fromUserId: payload.userId,
          fromUserName: payload.fromUserName || 'Inbound Call',
          callType: 'Video',
          roomId: payload.callId,
          isMeetingInvite: false
        });
      });
    });

    hub.on('CallAccepted', (byUserId, peerId) => {
      this.ngZone.run(() => {
        console.log(`✅ Call Accepted: By ${byUserId}`);
        this.isCalling.set(false);
        this.outgoingCall.set(null);
        this.callAcceptedSubject.next({ byUserId, peerId });
      });
    });

    hub.on('CallRejected', (byUserId, reason) => {
      this.ngZone.run(() => {
        console.log(`❌ Call Rejected: By ${byUserId} Reason: ${reason}`);
        this.isCalling.set(false);
        this.outgoingCall.set(null);
        this.incomingCall.set(null);
        this.callRejectedSubject.next({ byUserId, reason });
      });
    });

    hub.on('CallEnded', (byUserId) => {
      this.ngZone.run(() => {
        console.log(`🏁 Call Ended: By ${byUserId}`);
        this.incomingCall.set(null);
        this.isCalling.set(false);
        this.outgoingCall.set(null);
        this.callEndedSubject.next(byUserId);
      });
    });

    hub.on('InviteToMeeting', (meetingId, fromUserName) => {
      this.ngZone.run(() => {
        console.log(`🚀 Invited to join meeting ${meetingId} by ${fromUserName}`);
        this.incomingCall.set({
          fromUserId: 'system',
          fromUserName,
          callType: 'Video',
          roomId: meetingId,
          isMeetingInvite: true
        });
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
    hub.on('userStatusChanged', statusHandler);
    hub.on('userstatuschanged', statusHandler);
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

  public async startCall(targetUserId: string, fromUserName: string, callType: CallType, roomId?: string): Promise<void> {
    await this.ensureConnected();
    this.isCalling.set(true);
    this.outgoingCall.set({
      targetUserId,
      targetUserName: 'participant',
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
        console.log('✅ API Call Session Started:', res?.data?.callId);
        
        // Step 2: Signal the Hub (Ensures immediate UI popup on the other side)
        if (this.hubConnection) {
          try {
            await this.hubConnection.invoke('StartCall', targetUserId, fromUserName, callType, roomId || res?.data?.callId);
          } catch (invokeErr) {
            // Some server environments might rely SOLELY on the API to trigger the hub event.
            // If invoke fails with "method not found", we treat it as non-fatal.
            console.warn('⚠️ Hub StartCall invoke failed (possibly API-only trigger):', invokeErr);
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

  public async cancelOutgoingCall(): Promise<void> {
    const outgoing = this.outgoingCall();
    this.isCalling.set(false);
    this.outgoingCall.set(null);

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
    await this.hubConnection?.invoke('AcceptCall', targetUserId);
  }

  public async rejectCall(targetUserId: string, reason: string): Promise<void> {
    await this.ensureConnected();
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

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log('Call SignalR Stopped'))
        .catch(err => console.error('Error stopping Call SignalR: ', err));
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
