import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CalendarEvent, CreateEventDto, CalendarViewType } from '../models/calendar.model';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private http = inject(HttpClient);
  private apiBaseUrl = environment.apiBaseUrl + '/calendar';
  private hubUrl = environment.signalRUrl + '/calendar';

  private hubConnection?: HubConnection;

  constructor() {
    this.startHubConnection();
  }

  private startHubConnection() {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.start().catch(err => console.error('Error starting SignalR Calendar hub: ', err));
  }

  getEvents(start: Date, end: Date): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>(`${this.apiBaseUrl}/events`, {
      params: { 
        start: start.toISOString(), 
        end: end.toISOString() 
      }
    }).pipe(
      map(events => events.map(e => ({
        ...e,
        startTimeUtc: new Date(e.startTimeUtc),
        endTimeUtc: new Date(e.endTimeUtc)
      })))
    );
  }

  createEvent(dto: CreateEventDto): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>(`${this.apiBaseUrl}/events`, dto);
  }

  updateEvent(id: string, dto: CreateEventDto): Observable<CalendarEvent> {
    return this.http.put<CalendarEvent>(`${this.apiBaseUrl}/events/${id}`, dto);
  }

  deleteEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/events/${id}`);
  }

  respondToInvite(eventId: string, status: string): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/respond`, { eventId, status });
  }

  getAvailability(userId: string, range: { start: string, end: string }): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>(`${this.apiBaseUrl}/availability`, {
      params: { 
        userId, 
        start: range.start, 
        end: range.end 
      }
    });
  }

  getUpcoming(): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>(`${this.apiBaseUrl}/upcoming`);
  }


  // Listeners for Real-time
  onEventUpdate(callback: (eventId: string, title: string) => void) {
    this.hubConnection?.on('EventUpdated', callback);
  }

  onInvitationReceived(callback: (eventId: string, title: string, organizerName: string) => void) {
    this.hubConnection?.on('InvitationReceived', callback);
  }
}
