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

   pickUserDetailsForStorage(user: any): StoredUserDetails {
    return {
      Id: user?.Id || user?.id || user?.UserId || user?.userId,
      Email: user?.Email || user?.email,
      FullName: user?.FullName || user?.fullName || user?.Name || user?.name,
      PhoneNumber: user?.PhoneNumber || user?.phoneNumber || user?.Mobile || user?.mobile,
      IsActive: user?.IsActive ?? user?.isActive,
      Name: user?.Name || user?.name,
      Surname: user?.Surname || user?.surname,
      UserTypeId: user?.UserTypeId || user?.userTypeId,
      UserId: user?.UserId || user?.userId || user?.Id || user?.id,
      GenderId: user?.GenderId || user?.genderId,
      UserStatusId: user?.UserStatusId ?? user?.userStatusId,
      RoleId: user?.RoleId || user?.roleId,
      IsAdmin: user?.IsAdmin ?? user?.isAdmin,
      ImageUrl: user?.ImageUrl || user?.imageUrl,
      dialCode: user?.dialCode || user?.DialCode,
      IsDefault: user?.IsDefault ?? user?.isDefault,
      EmpId: user?.EmpId || user?.empId,
      WorkingCompanyId: user?.WorkingCompanyId || user?.workingCompanyId,
      IsDeleted: user?.IsDeleted ?? user?.isDeleted,
      CompanyName: user?.CompanyName || user?.companyName,
    };
  }
}
