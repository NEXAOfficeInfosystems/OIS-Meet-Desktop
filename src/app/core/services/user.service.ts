// core/services/user.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/common.models';

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
  private apiUrl = `${environment.apiBaseUrl}/User`;

  constructor(private http: HttpClient) { }

  //  Sync SSO Users
  syncSsoUsers(users: any[], clientId: string, companyId: any): Observable<ApiResponse<any>> {
    const usersWithClientInfo = users.map(user => ({
      ...user,
      clientId,
      companyId
    }));

    return this.http.post<ApiResponse<any>>(
      `${this.apiUrl}/sync-sso-users`,
      usersWithClientInfo
    );
  }

  // Get Users
  getOisMeetUsers(clientId: string, companyId: any): Observable<ApiResponse<any[]>> {
    const params = new HttpParams()
      .set('clientId', clientId)
      .set('companyId', companyId.toString());

    return this.http.get<ApiResponse<any[]>>(
      `${this.apiUrl}`,
      { params }
    );
  }


  // syncSSOUsers(users: SSOUser[]): Observable<ApiResponse<boolean>> {
  //   return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/sync-sso-users`, users);
  // }

  // getChatUsers(): Observable<ApiResponse<ChatUser[]>> {
  //   return this.http.get<ApiResponse<ChatUser[]>>(`${this.apiUrl}/chat-users`);
  // }

}
