import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateMeetingRequest {
  topic: string;
  hostId: string;
  hostName: string;
  expiryHours: number;
  settings: MeetingSettings;
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

  constructor(private http: HttpClient) {}

  // ── Cache accessors ──────────────────────────────────────────────────────

  getPendingMeeting(): MeetingResponse | null {
    return this._pendingMeeting;
  }

  clearPendingMeeting(): void {
    this._pendingMeeting = null;
  }

  createMeeting(request: CreateMeetingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, request).pipe(
      tap((response: any) => {
        if (response?.success && response?.data) {
          this._pendingMeeting = response.data as MeetingResponse;
        }
      })
    );
    }

  validateMeeting(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/validate/${meetingId}`);
  }

  joinMeeting(request: JoinMeetingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/join`, request);
  }

  getMeeting(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${meetingId}`);
  }

  getMeetingParticipants(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${meetingId}/participants`);
  }

  getLivekitToken(meetingId: string, userId: string, userName: string): Observable<any> {
    const encodedUserId   = encodeURIComponent(userId);
    const encodedUserName = encodeURIComponent(userName);
    return this.http.get(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/livekit-token` +
      `?userId=${encodedUserId}&userName=${encodedUserName}`
    );
  }

  endMeeting(meetingId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/end?userId=${encodeURIComponent(userId)}`,
      null
    );
  }

  leaveMeeting(meetingId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${encodeURIComponent(meetingId)}/leave?userId=${encodeURIComponent(userId)}`,
      null
    );
  }

  getUserActiveMeetings(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/${userId}/active`);
  }
}
