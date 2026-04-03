import { Injectable, NgZone } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import { NotificationDto } from '../models/collaboration.models';

@Injectable({ providedIn: 'root' })
export class CollaborationRealtimeService {
  private notificationHub?: signalR.HubConnection;
  private callHub?: signalR.HubConnection;

  private notificationReceivedSubject = new BehaviorSubject<NotificationDto | null>(null);
  private inviteToCallSubject = new BehaviorSubject<{ userId: string; callId: string } | null>(null);
  private callStartedSubject = new BehaviorSubject<any>(null);
  private userJoinedCallSubject = new BehaviorSubject<any>(null);
  private userLeftCallSubject = new BehaviorSubject<any>(null);
  private callEndedSubject = new BehaviorSubject<any>(null);
  private userStatusChangedSubject = new BehaviorSubject<{ userId: string; status: string } | null>(null);

  notificationReceived$ = this.notificationReceivedSubject.asObservable();
  inviteToCall$ = this.inviteToCallSubject.asObservable();
  callStarted$ = this.callStartedSubject.asObservable();
  userJoinedCall$ = this.userJoinedCallSubject.asObservable();
  userLeftCall$ = this.userLeftCallSubject.asObservable();
  callEnded$ = this.callEndedSubject.asObservable();
  userStatusChanged$ = this.userStatusChangedSubject.asObservable();

  constructor(
    private readonly ngZone: NgZone,
    private readonly session: SessionService
  ) {}

  start(userId?: string | null): void {
    const resolvedUserId = userId || this.session.getOISMeetUserId() || this.session.getUserId();
    if (!resolvedUserId) {
      return;
    }

    this.startNotificationHub(resolvedUserId);
    this.startCallHub(resolvedUserId);
  }

  stop(): void {
    void this.notificationHub?.stop();
    void this.callHub?.stop();
  }

  private startNotificationHub(userId: string): void {
    if (this.notificationHub?.state === signalR.HubConnectionState.Connected ||
        this.notificationHub?.state === signalR.HubConnectionState.Connecting) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    this.notificationHub = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/notifications?userId=${encodeURIComponent(userId)}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    this.notificationHub.on('NotificationReceived', (payload: NotificationDto) => {
      this.ngZone.run(() => this.notificationReceivedSubject.next(payload));
    });

    this.notificationHub.on('InviteToCall', (payload: { userId: string; callId: string }) => {
      this.ngZone.run(() => this.inviteToCallSubject.next(payload));
    });

    this.notificationHub.on('UserStatusChanged', (payload: { userId: string; status: string }) => {
      this.ngZone.run(() => this.userStatusChangedSubject.next(payload));
    });

    void this.notificationHub.start();
  }

  private startCallHub(userId: string): void {
    if (this.callHub?.state === signalR.HubConnectionState.Connected ||
        this.callHub?.state === signalR.HubConnectionState.Connecting) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    this.callHub = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/calls?userId=${encodeURIComponent(userId)}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    this.callHub.on('CallStarted', (payload: any) => {
      this.ngZone.run(() => this.callStartedSubject.next(payload));
    });

    this.callHub.on('UserJoinedCall', (payload: any) => {
      this.ngZone.run(() => this.userJoinedCallSubject.next(payload));
    });

    this.callHub.on('UserLeftCall', (payload: any) => {
      this.ngZone.run(() => this.userLeftCallSubject.next(payload));
    });

    this.callHub.on('CallEnded', (payload: any) => {
      this.ngZone.run(() => this.callEndedSubject.next(payload));
    });

    this.callHub.on('InviteToCall', (payload: { userId: string; callId: string }) => {
      this.ngZone.run(() => this.inviteToCallSubject.next(payload));
    });

    this.callHub.on('UserStatusChanged', (payload: { userId: string; status: string }) => {
      this.ngZone.run(() => this.userStatusChangedSubject.next(payload));
    });

    void this.callHub.start();
  }

  joinCall(callId: string): Promise<void> {
    return this.callHub?.invoke('JoinCall', callId) ?? Promise.resolve();
  }

  leaveCall(callId: string): Promise<void> {
    return this.callHub?.invoke('LeaveCall', callId) ?? Promise.resolve();
  }

  inviteToCall(userId: string, callId: string): Promise<void> {
    return this.callHub?.invoke('InviteToCall', userId, callId) ?? Promise.resolve();
  }
}
