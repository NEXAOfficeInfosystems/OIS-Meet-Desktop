import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';

export interface CreateMeetingRequest {
  topic: string;
  hostId: string;
  hostName: string;
  expiryHours: number;
  settings: MeetingSettings;
  conversationId?: string;
}

export interface JoinMeetingRequest {
  meetingId: string;
  userId: string;
  userName: string;
}

export interface MeetingSettings {
  muteOnEntry: boolean;
  allowChat: boolean;
  allowScreenShare: boolean;
  maxParticipants: number;
  waitingRoom?: boolean;
}

export interface MeetingResponse {
  id: string;
  meetingId: string;
  topic: string;
  hostId: string;
  hostName: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  startedAt?: Date;
  settings: MeetingSettings;
  participantCount: number;
  conversationId?: string;
}

export interface ParticipantResponse {
  id: string;
  userId: string;
  userName: string;
  joinedAt: Date;
  isMuted: boolean;
  isVideoOff: boolean;
  isHost: boolean;
}

@Injectable({ providedIn: 'root' })
export class MeetingService {
  private apiUrl = `${environment.apiBaseUrl}/Meeting`;

  private _pendingMeeting: MeetingResponse | null = null;

  constructor(private http: HttpClient, private sessionService: SessionService) { }

  private getHeaders(): HttpHeaders {
    const token = this.sessionService.getSsoToken();
    // Only include Authorization header when a valid token is available
    // Sending 'Bearer null' causes some backends to reject the request
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return new HttpHeaders(headers);
  }

  // ── Cache accessors ──────────────────────────────────────────────────────

  getPendingMeeting(): MeetingResponse | null {
    return this._pendingMeeting;
  }

  clearPendingMeeting(): void {
    this._pendingMeeting = null;
  }

  createMeeting(request: CreateMeetingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, request, { headers: this.getHeaders() }).pipe(
      tap((response: any) => {
        if (response?.success && response?.data) {
          this._pendingMeeting = response.data as MeetingResponse;
        }
      })
    );
  }

  /** Convenience async wrapper used by ChatComponent.startGroupCall */
  createMeetingAsync(request: CreateMeetingRequest): Promise<any> {
    return firstValueFrom(this.createMeeting(request));
  }

  validateMeeting(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/validate/${meetingId}`, { headers: this.getHeaders() });
  }

  joinMeeting(request: JoinMeetingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/join`, request, { headers: this.getHeaders() });
  }

  getMeeting(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${meetingId}`, { headers: this.getHeaders() });
  }

  getMeetingParticipants(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${meetingId}/participants`, { headers: this.getHeaders() });
  }

  getLivekitToken(meetingId: string, userId: string, userName: string): Observable<any> {
    const encodedUserId = encodeURIComponent(userId);
    const encodedUserName = encodeURIComponent(userName);
    return this.http.get(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/livekit-token` +
      `?userId=${encodedUserId}&userName=${encodedUserName}`,
      { headers: this.getHeaders() }
    );
  }

  endMeeting(meetingId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/end?userId=${encodeURIComponent(userId)}`,
      null,
      { headers: this.getHeaders() }
    );
  }

  leaveMeeting(meetingId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/leave?userId=${encodeURIComponent(userId)}`,
      null,
      { headers: this.getHeaders() }
    );
  }

  getUserActiveMeetings(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/${userId}/active`, { headers: this.getHeaders() });
  }
}
