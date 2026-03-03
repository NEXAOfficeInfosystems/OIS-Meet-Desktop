const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createMainWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const startUrl = process.env.ELECTRON_START_URL;

  if (startUrl) {
    void mainWindow.loadURL(startUrl);
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'ois-meet-desktop', 'browser', 'index.html');
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Audio Recording
ipcMain.handle('save-audio-file', async (event, { buffer, defaultFileName }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Meeting Recording',
      defaultPath: path.join(app.getPath('documents'), defaultFileName || 'meeting-recording.wav'),
      filters: [
        { name: 'WAV Audio', extensions: ['wav'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const uint8Array = new Uint8Array(buffer);
    fs.writeFileSync(result.filePath, Buffer.from(uint8Array));

    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Error saving audio file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-recordings-path', () => {
  const recordingsPath = path.join(app.getPath('documents'), 'OIS-Meet-Recordings');
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }
  return recordingsPath;
});

// IPC Handler for Transcription (bypasses renderer CORS)
ipcMain.handle('transcribe-audio-file', async (_event, { buffer, fileName }) => {
  try {
    const transcriptionUrl = 'http://20.64.87.203:8002/transcribe';
    const safeFileName = fileName || `meeting-audio-${Date.now()}.wav`;

    const fetchFn = globalThis.fetch;
    const FormDataCtor = globalThis.FormData;
    const BlobCtor = globalThis.Blob;

    if (!fetchFn || !FormDataCtor || !BlobCtor) {
      throw new Error('Transcription requires global fetch/FormData/Blob (Electron 29+/Node 18+)');
    }

    // `buffer` is expected to be an ArrayBuffer from the renderer.
    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
    const blob = new BlobCtor([uint8Array], { type: 'audio/wav' });

    const form = new FormDataCtor();
    form.append('file', blob, safeFileName);

    const response = await fetchFn(transcriptionUrl, {
      method: 'POST',
      body: form
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        error: typeof payload === 'string' ? payload : JSON.stringify(payload)
      };
    }

    return { success: true, status: response.status, data: payload };
  } catch (error) {
    console.error('Error transcribing audio file:', error);
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
});
