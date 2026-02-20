import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { StoredDefaultCompany, StoredUserDetails } from '../models/session.models';

export interface AppSession {
  ssoToken: string | null;
  userDetails: StoredUserDetails | null;
  defaultCompany: StoredDefaultCompany | null;
  meetAppId: string | null;
  applicationName: string | null;
  applicationUrl: string | null;
  applicationToken: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  constructor(
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) { }

  getSsoToken(): string | null {
    return this.authService.getSSOToken();
  }

  getUserDetails(): StoredUserDetails | null {
    return this.storageService.getObject<StoredUserDetails>('userDetails');
  }

  getFullName(): string | null {
    return this.getUserDetails()?.FullName ?? null;
  }

  getDefaultCompany(): StoredDefaultCompany | null {
    return this.storageService.getObject<StoredDefaultCompany>('defaultCompany');
  }

  getClientId(): string | null {
    return this.getDefaultCompany()?.clientId ?? null;
  }

  getCompanyId(): number | string | null {
    return this.getDefaultCompany()?.companyId ?? null;
  }

  getCompanyName(): string | null {
    return this.getDefaultCompany()?.companyname ?? null;
  }

  getCompanyLogo(): string | null {
    return this.getDefaultCompany()?.companylogo ?? null;
  }

  getMeetAppId(): string | null {
    return this.storageService.getItem('meetAppId');
  }

  getApplicationName(): string | null {
    return this.storageService.getItem('applicationName');
  }

  getApplicationUrl(): string | null {
    return this.storageService.getItem('applicationUrl');
  }

  getApplicationToken(): string | null {
    return this.storageService.getItem('applicationToken');
  }

  getSession(): AppSession {
    return {
      ssoToken: this.getSsoToken(),
      userDetails: this.getUserDetails(),
      defaultCompany: this.getDefaultCompany(),
      meetAppId: this.getMeetAppId(),
      applicationName: this.getApplicationName(),
      applicationUrl: this.getApplicationUrl(),
      applicationToken: this.getApplicationToken(),
    };
  }
}
