const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recordingControls', {
  onStateUpdate: (callback) => {
    ipcRenderer.on('recording-state-update', (_event, state) => callback(state));
  },
  sendAction: (action) => {
    ipcRenderer.send('recording-control-action', action);
  }
});
