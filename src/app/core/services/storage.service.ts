import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import * as CryptoJS from 'crypto-js';
import { UserDetailsResponse } from './sso-api.service';
import { StoredUserDetails } from '../models/session.models';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor() { }

  private secretKey = environment.secretkey;

  // Encrypt and Save
  setItem(key: string, value: string): void {
    const encrypted = CryptoJS.AES.encrypt(value, this.secretKey).toString();
    localStorage.setItem(key, encrypted);
  }

  setObject(key: string, value: unknown): void {
    this.setItem(key, JSON.stringify(value));
  }

  // Decrypt and Get
  getItem(key: string): string | null {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, this.secretKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error('Decryption error', e);
      return null;
    }
  }

  getObject<T>(key: string): T | null {
    const decrypted = this.getItem(key);
    if (!decrypted) return null;

    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return null;
    }
  }

  // Remove key
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  // Clear all storage
  clear(): void {
    localStorage.clear();
  }


  decryptUserInfo(encryptedData: string): unknown {
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    // Convert back to object
    return JSON.parse(decrypted);
  }

  extractTokenFromAppUrl(appUrl: string): string | null {
    try {
      const url = new URL(appUrl);
      return url.searchParams.get('Token') ?? url.searchParams.get('token');
    } catch {
      const match = appUrl.match(/[?&]Token=([^&]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  }

   pickUserDetailsForStorage(user: UserDetailsResponse): StoredUserDetails {
    return {
      Id: user?.Id,
      Email: user?.Email,
      FullName: user?.FullName,
      PhoneNumber: user?.PhoneNumber,
      IsActive: user?.IsActive,
      Name: user?.Name,
      Surname: user?.Surname,
      UserTypeId: user?.UserTypeId,
      UserId: user?.UserId,
      GenderId: user?.GenderId,
      UserStatusId: user?.UserStatusId,
      RoleId: user?.RoleId,
      IsAdmin: user?.IsAdmin,
      ImageUrl: user?.ImageUrl,
      dialCode: user?.dialCode,
      IsDefault: user?.IsDefault,
      EmpId: user?.EmpId,
      WorkingCompanyId: user?.WorkingCompanyId,
      IsDeleted: user?.IsDeleted,
      CompanyName: user?.CompanyName,
    };
  }
}
