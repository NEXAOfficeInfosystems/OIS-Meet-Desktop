const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oisMeet', {
  isElectron: true,

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
  }
});
