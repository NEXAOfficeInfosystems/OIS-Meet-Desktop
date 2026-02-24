// core/services/user.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, ChatUser } from './chat.service';

export interface SSOUser {
  id: string;
  fullName: string;
  email: string;
  avatarColor?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiBaseUrl}/user`;

  constructor(private http: HttpClient) {}

  syncSSOUsers(users: SSOUser[]): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/sync-sso-users`, users);
  }

  getChatUsers(): Observable<ApiResponse<ChatUser[]>> {
    return this.http.get<ApiResponse<ChatUser[]>>(`${this.apiUrl}/chat-users`);
  }


}
