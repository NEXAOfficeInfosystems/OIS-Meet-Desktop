const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('oisMeet', {
  // Placeholder for safe, future IPC APIs
});
