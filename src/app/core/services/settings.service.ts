import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from './storage.service';

export interface UserSettings {
  showMessagePreview: boolean;
  showMediaPreviews: boolean;
  notificationsMentionsOnly: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  showMessagePreview: true,
  showMediaPreviews: true,
  notificationsMentionsOnly: false
};

const SETTINGS_KEY = 'ois_user_settings';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private settingsSubject: BehaviorSubject<UserSettings>;
  public settings$: Observable<UserSettings>;

  constructor(private storageService: StorageService) {
    const savedSettings = this.storageService.getObject<UserSettings>(SETTINGS_KEY);
    const initialSettings = savedSettings ? { ...DEFAULT_SETTINGS, ...savedSettings } : DEFAULT_SETTINGS;
    
    this.settingsSubject = new BehaviorSubject<UserSettings>(initialSettings);
    this.settings$ = this.settingsSubject.asObservable();
  }

  get currentSettings(): UserSettings {
    return this.settingsSubject.value;
  }

  updateSettings(updates: Partial<UserSettings>): void {
    const newSettings = { ...this.settingsSubject.value, ...updates };
    this.settingsSubject.next(newSettings);
    this.storageService.setObject(SETTINGS_KEY, newSettings);
  }

  resetToDefault(): void {
    this.updateSettings(DEFAULT_SETTINGS);
  }
}
