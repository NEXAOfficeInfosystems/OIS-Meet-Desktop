import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

@Injectable({
  providedIn: 'root'
})
export class TauriService {
  public isTauri = !!(window as any).__TAURI_INTERNALS__;

  constructor() {
    if (this.isTauri) {
      this.setupBridge();
    }
  }

  private setupBridge(): void {
    const bridge = {
      isElectron: true, // For broad compatibility with existing code
      isTauri: true,
      isDesktop: true,

      openMeetingWindow: (payload: any) => invoke('open_meeting_window', { payload }),
      isMeetingActive: () => invoke('is_meeting_active'),
      setAuthData: (authData: any) => invoke('set_auth_data', { authData }),
      getAuthData: () => invoke('get_auth_data'),
      closeMeetingWindow: (opts: any) => invoke('close_meeting_window', { force: !!opts?.force }),

      saveAudioFile: (buffer: ArrayBuffer, defaultFileName: string) => {
        const uint8 = new Uint8Array(buffer);
        return invoke('save_audio_file', { buffer: Array.from(uint8), defaultFileName });
      },

      getRecordingsPath: () => invoke('get_recordings_path'),

      transcribeAudioFile: (buffer: ArrayBuffer, fileName: string, aiApiBaseUrl: string) => {
        const uint8 = new Uint8Array(buffer);
        return invoke('transcribe_audio_file', { buffer: Array.from(uint8), fileName, aiApiBaseUrl });
      },

      saveTranscriptTextFile: (content: string, defaultFileName: string) => {
        return invoke('save_transcript_text_file', { content, defaultFileName });
      },

      generateMom: (params: any) => invoke('generate_mom', params),

      showNotification: async ({ title, body }: { title: string, body: string }) => {
        let permission = await isPermissionGranted();
        if (!permission) {
          permission = await requestPermission() === 'granted';
        }
        if (permission) {
          sendNotification({ title, body });
        }
      },

      // Screen recording floating control window
      showRecordingControls: () => invoke('show_recording_controls'),
      updateRecordingControls: (state: any) => invoke('update_recording_controls', { state }),
      hideRecordingControls: () => invoke('hide_recording_controls'),
      onRecordingControlAction: async (callback: (action: string) => void) => {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen('recording-control-action', (event: any) => callback(event.payload as string));
      },

      // Screen capture sources (handled by browser in Tauri)
      getDesktopSources: (opts: any) => Promise.resolve([]),

      // Window API
      minimize: () => invoke('win_minimize'),
      maximize: () => invoke('win_maximize'),
      close: () => invoke('win_close'),
      focus: () => getCurrentWindow().setFocus(),
      isMaximized: () => invoke('win_is_maximized'),

      // Auto Updater (Placeholder for now)
      checkForUpdates: () => Promise.resolve({ success: true }),
      restartApp: async () => {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        return relaunch();
      }
    };

    (window as any).oisMeet = bridge;
    (window as any).windowAPI = {
        minimize: () => bridge.minimize(),
        maximize: () => bridge.maximize(),
        close: () => bridge.close(),
        focus: () => bridge.focus(),
        isMaximized: () => bridge.isMaximized()
    };
  }
}
