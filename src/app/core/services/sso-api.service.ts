import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CompanyUrlResponse, MeetUrlResponse } from '../models/session.models';

export interface CaptchaValidationRequest {
  id: string;
  captchaCode: string;
}

export interface UserDetailsResponse {
  Id?: string;
  Email?: string;
  FullName?: string;
  PhoneNumber?: string;
  IsActive?: boolean;
  Name?: string;
  Surname?: string;
  UserTypeId?: string;
  UserId?: string;
  GenderId?: string;
  UserStatusId?: string | null;
  RoleId?: string;
  IsAdmin?: boolean;
  ImageUrl?: string | null;
  dialCode?: string;
  IsDefault?: boolean;
  EmpId?: string | null;
  WorkingCompanyId?: number;
  IsDeleted?: boolean;
  CompanyName?: string;
  [key: string]: any;
}

export interface ApplicationItem {
  Code?: string;
  ApplicationId?: string | number;
  ApplicationName?: string;
  Url?: string;
  ImageUrl?: string | null;
  CoreApplicationId?: number;
  Description?: string | null;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class SsoApiService {
  private readonly ssoApiUrl = environment.ssoApiBaseUrl;

  constructor(
    private http: HttpClient,
  ) { }


  getCaptcha(): Observable<any> {
    const url = `${this.ssoApiUrl}/Captcha/generate`;
    return this.http.get<any>(url);
  }

  getCaptchaValidation(captchaData: CaptchaValidationRequest): Observable<any> {
    const url = `${this.ssoApiUrl}/Captcha/validate`;
    return this.http.post<any>(url, captchaData);
  }

  authenticateUser(encryptedPayload: string): Observable<any> {
    const url = `${this.ssoApiUrl}/TGeneralManagement/AuthenticateUser`;
    return this.http.post<any>(
      url,
      { encryptedPayload },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      }
    );
  }

  getUserDetails(token: string, userinfo: string): Observable<UserDetailsResponse> {
    const url = `${this.ssoApiUrl}/User/GetUser`;
    return this.http.get<any>(url, {
      headers: this.createAuthHeaders(token, userinfo),
    }).pipe(
      map(res => res?.response?.table?.[0] || res)
    );
  }

  getApplicationList(token: string, userinfo: string, userId: string): Observable<ApplicationItem[]> {
    const url = `${this.ssoApiUrl}/Application/GetAllApplicationList`;
    const params = new HttpParams().set('UserId', userId);
    return this.http.get<any>(url, {
      headers: this.createAuthHeaders(token, userinfo),
      params,
    }).pipe(
      map(res => res?.response?.table || res)
    );
  }

  getMeetUrl(token: string, userinfo: string, applicationId: string | number): Observable<MeetUrlResponse> {
    const url = `${this.ssoApiUrl}/Common/generate-app-access-url`;
    const params = new HttpParams().set('appId', applicationId.toString()).set('currentToken', token);
    return this.http.get<any>(url, {
      headers: this.createAuthHeaders(token, userinfo),
      params,
    }).pipe(
      map(res => res?.response?.table?.[0] || res)
    );
  }

  getCompanyURL(token: string, userinfo: string, userId: string, appId: string | number): Observable<CompanyUrlResponse> {
    const url = `${this.ssoApiUrl}/User/GetCompaniesAppByUser/${encodeURIComponent(userId)}`;
    const params = new HttpParams().set('appId', appId.toString());
    return this.http.get<any>(url, {
      headers: this.createAuthHeaders(token, userinfo),
      params,
    }).pipe(
      map(res => {
        // If it's the Response/Table format, wrap it in a data property to match CompanyUrlResponse expectation
        if (res?.response?.table) {
          return {
            success: true,
            data: res.response.table.map((x: any) => ({ company: x }))
          };
        }
        return res;
      })
    );
  }

  getSSOUserList(token: string, userinfo: string, client: string, companyId: string, appId: string): Observable<UserDetailsResponse[]> {
    const url = `${this.ssoApiUrl}/Common/GetUsersDetailsByClientCompanyDMS/${client}/${companyId}/${appId}`;
    return this.http.get<any>(url, {
      headers: this.createAuthHeaders(token, userinfo),
    }).pipe(
      map(res => res?.response?.table || res)
    );
  }

  private createAuthHeaders(token: string, userinfo: string): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token,
      'Userinfo': userinfo,
    });
  }
}

