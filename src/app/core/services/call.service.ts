import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
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

  public incomingCall$ = this.incomingCallSubject.asObservable();
  public callAccepted$ = this.callAcceptedSubject.asObservable();
  public callRejected$ = this.callRejectedSubject.asObservable();
  public callEnded$ = this.callEndedSubject.asObservable();
  
  public offer$ = this.offerSubject.asObservable();
  public answer$ = this.answerSubject.asObservable();
  public iceCandidate$ = this.iceCandidateSubject.asObservable();

  constructor() {}

  public startConnection(userId: string): void {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) return;

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/calls?userId=${userId}`)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('IncomingCall', (fromUserId, fromUserName, callType) => {
      this.incomingCallSubject.next({ fromUserId, fromUserName, callType });
    });

    this.hubConnection.on('CallAccepted', (byUserId, peerId) => {
      this.callAcceptedSubject.next({ byUserId, peerId });
    });

    this.hubConnection.on('CallRejected', (byUserId, reason) => {
      this.callRejectedSubject.next({ byUserId, reason });
    });

    this.hubConnection.on('CallEnded', (byUserId) => {
      this.callEndedSubject.next(byUserId);
    });

    this.hubConnection.on('ReceiveOffer', (fromUserId, offer) => {
      this.offerSubject.next({ fromUserId, offer });
    });

    this.hubConnection.on('ReceiveAnswer', (fromUserId, answer) => {
      this.answerSubject.next({ fromUserId, answer });
    });

    this.hubConnection.on('ReceiveIceCandidate', (fromUserId, candidate) => {
      this.iceCandidateSubject.next({ fromUserId, candidate });
    });

    this.hubConnection.start()
      .then(() => console.log('✅ Call Signaling Hub Connected'))
      .catch(err => console.error('❌ Call Hub Connection Error:', err));
  }

  public async startCall(targetUserId: string, fromUserName: string, callType: CallType): Promise<void> {
    await this.hubConnection.invoke('StartCall', targetUserId, fromUserName, callType);
  }

  public async acceptCall(targetUserId: string): Promise<void> {
    await this.hubConnection.invoke('AcceptCall', targetUserId);
  }

  public async rejectCall(targetUserId: string, reason: string): Promise<void> {
    await this.hubConnection.invoke('RejectCall', targetUserId, reason);
  }

  public async endCall(targetUserId: string): Promise<void> {
    await this.hubConnection.invoke('EndCall', targetUserId);
  }

  public async sendOffer(targetUserId: string, offer: any): Promise<void> {
    await this.hubConnection.invoke('SendOffer', targetUserId, offer);
  }

  public async sendAnswer(targetUserId: string, answer: any): Promise<void> {
    await this.hubConnection.invoke('SendAnswer', targetUserId, answer);
  }

  public async sendIceCandidate(targetUserId: string, candidate: any): Promise<void> {
    await this.hubConnection.invoke('SendIceCandidate', targetUserId, candidate);
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }
}
