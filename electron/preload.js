const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oisMeet', {
  isElectron: true,

  // ── Open a meeting in its own BrowserWindow ───────────────────────────────
  // Called by chat.component.ts and meet-now-dialog.component.ts.
  // Accepts either:
  //   - a structured { routePath, queryString } object  (production / file:// context)
  //   - a full http URL string (dev-server fallback, kept for compatibility)
  // Triggers ipcMain.on('open-meeting-window') in main.js.
  openMeetingWindow: (payload) => {
    ipcRenderer.send('open-meeting-window', payload);
  },

  isMeetingActive: () => {
    return ipcRenderer.invoke('is-meeting-active');
  },

  // Allow renderer to persist auth data in main process and retrieve it
  // (used to restore auth state in newly opened meeting windows).
  setAuthData: (authData) => {
    return ipcRenderer.invoke('set-auth-data', authData);
  },

  getAuthData: () => {
    return ipcRenderer.invoke('get-auth-data');
  },

  // Close the current meeting window. Pass { force: true } to destroy
  // (bypass main's close dialog). Use only when the renderer has already
  // confirmed the action.
  closeMeetingWindow: (opts) => {
    ipcRenderer.send('close-meeting-window', opts || {});
  },

  // ── Existing handlers (unchanged) ─────────────────────────────────────────

  saveAudioFile: (buffer, defaultFileName) => {
    return ipcRenderer.invoke('save-audio-file', { buffer, defaultFileName });
  },

  getRecordingsPath: () => {
    return ipcRenderer.invoke('get-recordings-path');
  },

  transcribeAudioFile: (buffer, fileName, aiApiBaseUrl) => {
    return ipcRenderer.invoke('transcribe-audio-file', { buffer, fileName, aiApiBaseUrl });
  },

  saveTranscriptTextFile: (content, defaultFileName) => {
    return ipcRenderer.invoke('save-transcript-text-file', { content, defaultFileName });
  },

  generateMom: ({ meetingId, date, momTemplateName, transcriptFilePath, aiApiBaseUrl }) => {
    return ipcRenderer.invoke('generate-mom', { meetingId, date, momTemplateName, transcriptFilePath, aiApiBaseUrl });
  },

  showNotification: ({ title, body }) => {
    return ipcRenderer.invoke('show-native-notification', { title, body });
  },

  // ── Auto Updater Events ───────────────────────────────────────────────
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, progress) => callback(progress));
  },
  checkForUpdates: () => {
    return ipcRenderer.invoke('check-for-updates');
  },
  restartApp: () => {
    ipcRenderer.send('restart-app');
  }
});

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  focus: () => ipcRenderer.send('win:focus'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized')
});

// When main process forwards cached auth for a newly created window, emit
// a DOM CustomEvent so renderer code listening for 'electron-auth-data'
// receives it (this mirrors the existing renderer-side listener).
ipcRenderer.on('electron-auth-data', (event, authData) => {
  try {
    window.dispatchEvent(new CustomEvent('electron-auth-data', { detail: authData }));
  } catch (err) {
    // In case window or CustomEvent isn't available yet, swallow the error.
    console.error('preload: failed to dispatch electron-auth-data event', err);
  }
});
