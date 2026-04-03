import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NativeNotificationService {
  notify(title: string, body: string): void {
    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.showNotification === 'function') {
      void electronApi.showNotification({ title, body });
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  async requestPermission(): Promise<void> {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }
}
