import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  waitingRoom: boolean;
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

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  userId: string;
  userName: string;
  joinedAt: Date;
  leftAt?: Date;
  isMuted: boolean;
  isVideoOff: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MeetingService {
  private apiUrl = `${environment.apiBaseUrl}/Meeting`;

  constructor(private http: HttpClient) {}

  createMeeting(request: CreateMeetingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, request);
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

  // getMeetingParticipants(meetingId: string): Observable<any> {
  //   return this.http.get(`${this.apiUrl}/${meetingId}/participants`);
  // }

  getMeetingParticipants(meetingId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${meetingId}/participants`);
  }

  endMeeting(meetingId: string, userId: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${meetingId}/end?userId=${userId}`, {});
  }

  leaveMeeting(meetingId: string, userId: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${meetingId}/leave?userId=${userId}`, {});
  }

  updateParticipantStatus(meetingId: string, userId: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${meetingId}/participant/${userId}`, data);
  }

  getUserActiveMeetings(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/${userId}/active`);
  }
}
