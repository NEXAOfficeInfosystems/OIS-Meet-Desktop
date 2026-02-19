import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import { StorageService } from './storage.service';

const TOKEN_COOKIE_KEY = 'GM_token';
const ENCRYPTED_JSON_COOKIE_KEY = 'encryptedJson';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly isAuthenticatedSubject: BehaviorSubject<boolean>;
  readonly isAuthenticated$;

  constructor(
    private readonly cookieService: CookieService,
    private readonly storageService: StorageService,
  ) {
    this.isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
    this.isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  getToken(): string | null {
    const token = this.cookieService.get(TOKEN_COOKIE_KEY);
    return token ? token : null;
  }

  setSession(token: string, encryptedJson?: string): void {
    this.cookieService.set(TOKEN_COOKIE_KEY, token);
    if (encryptedJson) {
      this.cookieService.set(ENCRYPTED_JSON_COOKIE_KEY, encryptedJson);
    }

    this.isAuthenticatedSubject.next(true);
  }

  clearSession(): void {
    this.cookieService.delete(TOKEN_COOKIE_KEY);
    this.cookieService.delete(ENCRYPTED_JSON_COOKIE_KEY);
    this.isAuthenticatedSubject.next(false);
  }

  logout(options?: { clearRememberedLogin?: boolean; clearAllStorage?: boolean }): void {
    this.clearSession();

    if (options?.clearAllStorage) {
      this.storageService.clear();
      return;
    }

    this.storageService.removeItem('userDetails');
    if (options?.clearRememberedLogin) {
      this.storageService.removeItem('rememberedLogin');
    }
  }

  private hasToken(): boolean {
    const token = this.cookieService.get(TOKEN_COOKIE_KEY);
    return token != null && token.trim().length > 0;
  }
}
