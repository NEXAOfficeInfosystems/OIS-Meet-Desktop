import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import {
  ActivityDto,
  BootstrapResponse,
  CallSessionDto,
  ChannelDto,
  CreateChannelRequest,
  CreateTeamRequest,
  InviteToCallRequest,
  JoinCallRequest,
  MarkNotificationsReadRequest,
  NotificationDto,
  StartCallRequest,
  TeamDto,
} from '../models/collaboration.models';

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private readonly apiUrl = `${environment.apiBaseUrl}/Collaboration`;

  constructor(
    private readonly http: HttpClient,
    private readonly session: SessionService
  ) {}

  private get userId(): string {
    return this.session.getOISMeetUserId() || this.session.getUserId() || '';
  }

  getBootstrap(): Observable<{ success: boolean; data: BootstrapResponse }> {
    return this.http.get<{ success: boolean; data: BootstrapResponse }>(
      `${this.apiUrl}/bootstrap`,
      { params: { userId: this.userId } }
    );
  }

  getTeams(): Observable<{ success: boolean; data: TeamDto[] }> {
    return this.http.get<{ success: boolean; data: TeamDto[] }>(
      `${this.apiUrl}/teams`,
      { params: { userId: this.userId } }
    );
  }

  createTeam(request: CreateTeamRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/teams`, request);
  }

  getChannels(teamId: string): Observable<{ success: boolean; data: ChannelDto[] }> {
    return this.http.get<{ success: boolean; data: ChannelDto[] }>(
      `${this.apiUrl}/channels`,
      { params: { teamId } }
    );
  }

  createChannel(request: CreateChannelRequest): Observable<any> {
    const createdBy = request.createdBy || this.userId;
    return this.http.post(`${this.apiUrl}/channels`, {
      ...request,
      createdBy
    });
  }

  getNotifications(): Observable<{ success: boolean; data: NotificationDto[]; unreadCount: number }> {
    return this.http.get<{ success: boolean; data: NotificationDto[]; unreadCount: number }>(
      `${this.apiUrl}/notifications`,
      { params: { userId: this.userId } }
    );
  }

  markNotificationsRead(notificationIds: string[]): Observable<any> {
    const request: MarkNotificationsReadRequest = {
      userId: this.userId,
      notificationIds
    };
    return this.http.post(`${this.apiUrl}/notifications/read`, request);
  }

  getActivity(limit = 30): Observable<{ success: boolean; data: ActivityDto[] }> {
    return this.http.get<{ success: boolean; data: ActivityDto[] }>(
      `${this.apiUrl}/activity`,
      { params: { userId: this.userId, take: String(limit) } }
    );
  }

  startCall(request: StartCallRequest): Observable<{ success: boolean; data: { callId: string } }> {
    return this.http.post<{ success: boolean; data: { callId: string } }>(
      `${this.apiUrl}/calls/start`,
      request
    );
  }

  getCall(callId: string): Observable<{ success: boolean; data: CallSessionDto }> {
    return this.http.get<{ success: boolean; data: CallSessionDto }>(
      `${this.apiUrl}/calls/${encodeURIComponent(callId)}`
    );
  }

  getCallLivekitToken(callId: string, userId: string, userName: string): Observable<{ success: boolean; data: { token: string; livekitUrl: string; roomName: string } }> {
    return this.http.get<{ success: boolean; data: { token: string; livekitUrl: string; roomName: string } }>(
      `${this.apiUrl}/calls/${encodeURIComponent(callId)}/livekit-token`,
      {
        params: {
          userId,
          userName
        }
      }
    );
  }

  joinCall(callId: string, request: JoinCallRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/calls/${encodeURIComponent(callId)}/join`, request);
  }

  leaveCall(callId: string, request: JoinCallRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/calls/${encodeURIComponent(callId)}/leave`, request);
  }

  endCall(callId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/calls/${encodeURIComponent(callId)}/end`,
      null,
      { params: { endedBy: this.userId } }
    );
  }

  inviteToCall(callId: string, request: InviteToCallRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/calls/${encodeURIComponent(callId)}/invite`, request);
  }
}
