import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { SessionService } from './session.service';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ElectronAuthService {
  private isElectron = false;
  private authData: any = null;
  
  constructor(
    @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private sessionService: SessionService,
    private storageService: StorageService,
    private authService: AuthService
  ) {
    this.isElectron = !!(window as any).oisMeet?.isElectron;
    
    if (this.isElectron) {
      this.setupAuthListener();
      this.restoreAuthData();
    }
  }
  
  private setupAuthListener(): void {
    // Listen for auth data from Electron main process
    window.addEventListener('electron-auth-data', ((event: CustomEvent) => {
      const authData = event.detail;
      console.log('[ElectronAuth] Received auth data from main process');
      this.applyAuthData(authData);
    }) as EventListener);
  }
  
  private async restoreAuthData(): Promise<void> {
    try {
      const electronApi = (window as any).oisMeet;
      const authData = await electronApi.getAuthData();
      
      if (authData && authData.token) {
        console.log('[ElectronAuth] Restored auth data from main process');
        this.applyAuthData(authData);
      } else {
        console.log('[ElectronAuth] No auth data found in main process');
      }
    } catch (error) {
      console.error('[ElectronAuth] Failed to restore auth data:', error);
    }
  }
  
  private applyAuthData(authData: any): void {
    this.authData = authData;
    
    // Store in localStorage for Angular auth service
    if (authData.token) {
      localStorage.setItem('token', authData.token);
      sessionStorage.setItem('token', authData.token);
    }
    
    if (authData.userinfo) {
      sessionStorage.setItem('userinfo', authData.userinfo);
    }
    
    if (authData.user) {
      this.storageService.setObject('userDetails', authData.user);
    }
    
    // if (authData.companyId) {
    //   this.storageService.setCompanyId(authData.companyId);
    // }
    
    // if (authData.clientId) {
    //   this.storageService.setClientId(authData.clientId);
    // }
    
    if (authData.meetAppId) {
      this.storageService.setItem('meetAppId', authData.meetAppId);
    }
    
    if (authData.oisMeetUserId) {
      this.storageService.setItem('oisMeetUserId', authData.oisMeetUserId);
    }
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('auth-restored', { detail: authData }));
    
    // Also inform AuthService so route guards and auth state update immediately
    try {
      if (this.authService && typeof this.authService.setSession === 'function') {
        this.authService.setSession(authData.token, authData.userinfo);
      }
    } catch (err) {
      // swallow errors
    }

    console.log('[ElectronAuth] Auth data applied successfully');
  }
  
  async ensureAuth(): Promise<boolean> {
    if (!this.isElectron) return true;
    
    // Check if we have auth data
    const token = localStorage.getItem('token');
    if (token) return true;
    
    // Try to restore from main process
    await this.restoreAuthData();
    
    // Check again
    const restoredToken = localStorage.getItem('token');
    if (restoredToken) return true;
    
    // No auth data, redirect to login
    console.warn('[ElectronAuth] No auth data found, redirecting to login');
    this.router.navigate(['/login']);
    return false;
  }
  
  isAuthenticated(): boolean {
    if (this.isElectron) {
      return !!localStorage.getItem('token');
    }
    return false;
  }
}