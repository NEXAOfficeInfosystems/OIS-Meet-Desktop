import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, UserSettings } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  settings: UserSettings = {
    showMessagePreview: true,
    showMediaPreviews: true,
    notificationsMentionsOnly: false
  };

  constructor(private settingsService: SettingsService) {}

  ngOnInit(): void {
    this.settingsService.settings$.subscribe(settings => {
      this.settings = { ...settings };
    });
  }

  toggleSetting(key: keyof UserSettings): void {
    this.settings[key] = !this.settings[key];
    this.settingsService.updateSettings({ [key]: this.settings[key] });
  }

  resetDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to default?')) {
      this.settingsService.resetToDefault();
    }
  }
}
