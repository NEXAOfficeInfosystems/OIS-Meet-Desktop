const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// TEMP SSL BYPASS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
let mainWindow;

function normalizeHttpBaseUrl(value, fallback) {
  const candidate = (typeof value === 'string' ? value : '').trim();
  const selected = candidate || fallback;
  const trimmed = selected.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(trimmed)) {
    return fallback.replace(/\/+$/, '');
  }

  return trimmed;
}

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

// IPC Handler for Transcription (avoid CORS by calling from main process)
ipcMain.handle('transcribe-audio-file', async (event, { buffer, fileName, aiApiBaseUrl }) => {
  try {
    const normalizedAiApiBaseUrl = normalizeHttpBaseUrl(
      aiApiBaseUrl,
      process.env.AI_API_BASE_URL || 'https://ai.nexaois.com:4433'
    );
    const transcriptionUrl = `${normalizedAiApiBaseUrl}/transcribe`;
console.log('AI Base URL used for transcription Main.js:', transcriptionUrl);
    // buffer arrives as an ArrayBuffer from the renderer
    const uint8Array = new Uint8Array(buffer);

    // Build a minimal multipart/form-data request body (no extra deps)
    const safeFileName = fileName || 'meeting-recording.wav';
    const boundary = `----oismeet-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header, 'utf8'),
      Buffer.from(uint8Array),
      Buffer.from(footer, 'utf8')
    ]);

    const response = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        filename: fileName,
        status: 'error',
        error: `Transcription request failed (${response.status} ${response.statusText})${text ? `: ${text}` : ''}`
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling transcription service (main):', error);
    return {
      filename: fileName,
      status: 'error',
      error: error && error.message ? error.message : 'Error calling transcription service'
    };
  }
});
