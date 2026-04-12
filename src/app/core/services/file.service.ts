import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private apiUrl = `${environment.apiBaseUrl}/Files`;

  constructor(
    private http: HttpClient,
    private sessionService: SessionService
  ) { }

  uploadFile(file: File, conversationId?: string): Observable<HttpEvent<any>> {
    const formData: FormData = new FormData();
    formData.append('file', file);
    const userId = this.sessionService.getOISMeetUserId() || this.sessionService.getUserId();
    if (userId) {
      formData.append('userId', userId);
    }
    if (conversationId) {
      formData.append('conversationId', conversationId);
    }

    const req = new HttpRequest('POST', `${this.apiUrl}/upload`, formData, {
      reportProgress: true,
      responseType: 'json'
    });

    return this.http.request(req);
  }

  getFileUrl(relativeUrl: string): string {
    if (!relativeUrl) return '';
    if (relativeUrl.startsWith('http')) return relativeUrl;
    // Remove leading slash if present
    const cleanPath = relativeUrl.startsWith('/') ? relativeUrl.substring(1) : relativeUrl;
    return `${environment.apiBaseUrl.replace('/api', '')}/${cleanPath}`;
  }

  downloadFile(fileUrl: string, fileName: string): void {
    const fullUrl = this.getFileUrl(fileUrl);
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
