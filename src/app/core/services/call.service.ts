import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CallType = 'Audio' | 'Video';

export interface IncomingCall {
  fromUserId: string;
  fromUserName: string;
  callType: CallType;
}

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private hubConnection!: signalR.HubConnection;
  private incomingCallSubject = new Subject<IncomingCall>();
  private callAcceptedSubject = new Subject<{ byUserId: string, peerId: string }>();
  private callRejectedSubject = new Subject<{ byUserId: string, reason: string }>();
  private callEndedSubject = new Subject<string>();

  private offerSubject = new Subject<{ fromUserId: string, offer: any }>();
  private answerSubject = new Subject<{ fromUserId: string, answer: any }>();
  private iceCandidateSubject = new Subject<{ fromUserId: string, candidate: any }>();

  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  public incomingCall$ = this.incomingCallSubject.asObservable();
  public callAccepted$ = this.callAcceptedSubject.asObservable();
  public callRejected$ = this.callRejectedSubject.asObservable();
  public callEnded$ = this.callEndedSubject.asObservable();
  public connectionState$ = this.connectionStateSubject.asObservable();

  public offer$ = this.offerSubject.asObservable();
  public answer$ = this.answerSubject.asObservable();
  public iceCandidate$ = this.iceCandidateSubject.asObservable();

  constructor() {}

  public isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  public startConnection(userId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) return;

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/calls?userId=${userId}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    this.hubConnection.onreconnecting(() => {
      this.connectionStateSubject.next(signalR.HubConnectionState.Reconnecting);
    });

    this.hubConnection.onreconnected(() => {
      this.connectionStateSubject.next(signalR.HubConnectionState.Connected);
    });

    this.hubConnection.onclose(() => {
      console.log('🔌 Call Hub Connection Closed');
      this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
    });

    // Logging & Implementation of Hub Events
    this.hubConnection.on('IncomingCall', (fromUserId, fromUserName, callType) => {
      console.log(`📞 Incoming Call: From ${fromUserName} (${fromUserId}) Type: ${callType}`);
      this.incomingCallSubject.next({ fromUserId, fromUserName, callType });
    });

    this.hubConnection.on('CallAccepted', (byUserId, peerId) => {
      console.log(`✅ Call Accepted: By ${byUserId}`);
      this.callAcceptedSubject.next({ byUserId, peerId });
    });

    this.hubConnection.on('CallRejected', (byUserId, reason) => {
      console.log(`❌ Call Rejected: By ${byUserId} Reason: ${reason}`);
      this.callRejectedSubject.next({ byUserId, reason });
    });

    this.hubConnection.on('CallEnded', (byUserId) => {
      console.log(`🏁 Call Ended: By ${byUserId}`);
      this.callEndedSubject.next(byUserId);
    });

    this.hubConnection.on('ReceiveOffer', (fromUserId, offer) => {
      console.log(`📡 Received WebRTC Offer: From ${fromUserId}`);
      this.offerSubject.next({ fromUserId, offer });
    });

    this.hubConnection.on('ReceiveAnswer', (fromUserId, answer) => {
      console.log(`📡 Received WebRTC Answer: From ${fromUserId}`);
      this.answerSubject.next({ fromUserId, answer });
    });

    this.hubConnection.on('ReceiveIceCandidate', (fromUserId, candidate) => {
      console.log(`🧊 Received ICE Candidate: From ${fromUserId}`);
      this.iceCandidateSubject.next({ fromUserId, candidate });
    });

    // Handle user status changes (case-sensitive match required)
    const statusHandler = (userId: string, status: string) => {
      console.log(`👤 User status changed (CallsHub): ${userId} -> ${status}`);
    };
    this.hubConnection.on('userStatusChanged', statusHandler);
    this.hubConnection.on('userstatuschanged', statusHandler);

    this.hubConnection.start()
      .then(() => {
        console.log('✅ Call Signaling Hub Connected');
        this.connectionStateSubject.next(signalR.HubConnectionState.Connected);
      })
      .catch(err => {
        console.error('❌ Call Hub Connection Error:', err);
        this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
      });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      const state = this.hubConnection?.state;
      if (state === signalR.HubConnectionState.Connecting || state === signalR.HubConnectionState.Reconnecting) {
        console.log(`Call hub is currently ${state}. Waiting for connection...`);
        let attempts = 0;
        while (!this.isConnected() && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        if (this.isConnected()) return;
      }

      // If still not connected, try to restart IF we have a userId
      throw new Error(`Call signaling is unavailable (Status: ${state || 'Disconnected'}). Please check your internet and try again.`);
    }
  }

  public async startCall(targetUserId: string, fromUserName: string, callType: CallType): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('StartCall', targetUserId, fromUserName, callType);
  }

  public async acceptCall(targetUserId: string): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('AcceptCall', targetUserId);
  }

  public async rejectCall(targetUserId: string, reason: string): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('RejectCall', targetUserId, reason);
  }

  public async endCall(targetUserId: string): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('EndCall', targetUserId);
  }

  public async sendOffer(targetUserId: string, offer: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('SendOffer', targetUserId, offer);
  }

  public async sendAnswer(targetUserId: string, answer: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('SendAnswer', targetUserId, answer);
  }

  public async sendIceCandidate(targetUserId: string, candidate: any): Promise<void> {
    await this.ensureConnected();
    await this.hubConnection.invoke('SendIceCandidate', targetUserId, candidate);
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}
