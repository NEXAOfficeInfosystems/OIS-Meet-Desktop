import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const AUTH_STORAGE_KEY = 'oisMeet.isAuthenticated';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(
    this.readInitialAuthState()
  );

  readonly isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  isAuthenticated() {
    return this.isAuthenticatedSubject.value;
  }

  login(username: string, password: string) {
    const ok = username.trim().length > 0 && password.trim().length > 0;
    if (!ok) return false;

    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    this.isAuthenticatedSubject.next(true);
    return true;
  }

  logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.isAuthenticatedSubject.next(false);
  }

  private readInitialAuthState() {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  }
}
