const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oisMeet', {
  isElectron: true,

  saveAudioFile: (buffer, defaultFileName) => {
    return ipcRenderer.invoke('save-audio-file', { buffer, defaultFileName });
  },

  getRecordingsPath: () => {
    return ipcRenderer.invoke('get-recordings-path');
  }
});
