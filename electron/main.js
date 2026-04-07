const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, session, nativeImage } = electron;
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Auto Updater Configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;


// Define global app icon path for consistency
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');
const APP_ICON = fs.existsSync(APP_ICON_PATH) ? nativeImage.createFromPath(APP_ICON_PATH) : null;
const APP_ID = 'com.ois.meet.desktop';

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// TEMP SSL BYPASS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ─────────────────────────────────────────────────────────────────────────────
// ── AUTO UPDATER LOGIC ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[Updater] Update not available.');
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  console.log('[Updater]', log_message);
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

ipcMain.on('restart-app', () => {
  autoUpdater.quitAndInstall();
});

// ─────────────────────────────────────────────────────────────────────────────
// ── CUSTOM WINDOW CONTROLS ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.on('win:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('win:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on('win:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('win:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

let mainWindow;
let appTray;
let storedAuthData = null;

ipcMain.handle('set-auth-data', async (event, authData) => {
  try {
    storedAuthData = authData || null;
    return { success: true };
  } catch (err) {
    console.error('[main] set-auth-data failed:', err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('get-auth-data', async () => {
  return storedAuthData;
});

app.setName('OIS Meet');

function safeFileName(value, fallback) {
  const candidate = (typeof value === 'string' ? value : '').trim();
  const selected  = candidate || fallback;
  return selected
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[.\s]+$/g, '')
    .slice(0, 180) || fallback;
}

function formatDateDdMmYyyy(date) {
  const d    = date instanceof Date ? date : new Date();
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function normalizeHttpBaseUrl(value, fallback) {
  const candidate = (typeof value === 'string' ? value : '').trim();
  const selected  = candidate || fallback;
  const trimmed   = selected.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return fallback.replace(/\/+$/, '');
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WINDOW
// ─────────────────────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    resizable: true,
    icon: APP_ICON || undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      nativeWindowOpen: true,
    }
  });

  const startUrl = process.env.ELECTRON_START_URL;

  if (startUrl) {
    void mainWindow.loadURL(startUrl);
  } else {
    const indexPath = path.join(
      app.getAppPath(), 'dist', 'ois-meet-desktop', 'browser', 'index.html'
    );
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  if (!APP_ICON) return;

  appTray = new Tray(APP_ICON);
  appTray.setToolTip('OIS Meet');
  appTray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show OIS Meet',
      click: () => {
        if (!mainWindow) {
          createMainWindow();
          return;
        }
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]));

  appTray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true;
    return false;
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createMainWindow();
  createTray();

  // Initialize auto-update check on startup (after 5 seconds to let the app load)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Open a dedicated BrowserWindow for a meeting ─────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.on('open-meeting-window', (event, payload) => {
  const meetingWindow = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    title:     'OIS Meet — Meeting',
    autoHideMenuBar: true,
    icon: APP_ICON || undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      nativeWindowOpen: true,
    }
  });

  meetingWindow.setMenuBarVisibility(false);

  if (payload && typeof payload === 'object' && payload.routePath) {
    const { routePath, queryString } = payload;
    if (process.env.ELECTRON_START_URL) {
      const devBase = process.env.ELECTRON_START_URL.replace(/\/$/, '');
      const fullUrl = queryString ? `${devBase}/#${routePath}?${queryString}` : `${devBase}/#${routePath}`;
      void meetingWindow.loadURL(fullUrl);
    } else {
      const indexPath = path.join(app.getAppPath(), 'dist', 'ois-meet-desktop', 'browser', 'index.html');
      const hashPath = queryString ? `${routePath}?${queryString}` : routePath;
      void meetingWindow.loadFile(indexPath, { hash: hashPath });
    }
  } else if (typeof payload === 'string' && /^https?:\/\//i.test(payload)) {
    const legacyUrl = payload.replace(/(https?:\/\/[^/#]+)(\/)/, '$1/#/');
    void meetingWindow.loadURL(legacyUrl);
  } else {
    meetingWindow.destroy();
    return;
  }

  meetingWindow.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(meetingWindow, {
      type:      'question',
      buttons:   ['Leave Meeting', 'Cancel'],
      title:     'Leave Meeting?',
      message:   'Are you sure you want to leave the meeting?',
      defaultId: 1,
      cancelId:  1,
    });
    if (choice === 1) e.preventDefault();
  });

  meetingWindow.webContents.on('did-finish-load', () => {
    try {
      if (storedAuthData) {
        meetingWindow.webContents.send('electron-auth-data', storedAuthData);
      }
    } catch (err) {
      console.error('[main] Failed to forward auth data to meeting window:', err);
    }
  });
});

ipcMain.on('close-meeting-window', (event, { force } = { force: false }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (force) win.destroy();
    else win.close();
  } catch (err) {
    console.error('[main] Error closing meeting window:', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('show-native-notification', async (event, { title, body }) => {
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications are not supported on this system' };
    }
    const notification = new Notification({
      title:  typeof title === 'string' && title.trim() ? title.trim() : 'OIS Meet',
      body:   typeof body  === 'string' ? body : '',
      icon:   APP_ICON || undefined,
      appID:  APP_ID,
      silent: false
    });
    notification.show();
    return { success: true };
  } catch (error) {
    console.error('Error showing native notification:', error);
    return { success: false, error: error.message };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('save-audio-file', async (event, { buffer, defaultFileName }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       'Save Meeting Recording',
      defaultPath: path.join(app.getPath('documents'), defaultFileName || 'meeting-recording.wav'),
      filters: [
        { name: 'WAV Audio',  extensions: ['wav'] },
        { name: 'All Files',  extensions: ['*']   }
      ]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
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
  if (!fs.existsSync(recordingsPath)) fs.mkdirSync(recordingsPath, { recursive: true });
  return recordingsPath;
});

ipcMain.handle('save-transcript-text-file', async (event, { content, defaultFileName }) => {
  try {
    const recordingsPath = path.join(app.getPath('documents'), 'OIS-Meet-Recordings');
    if (!fs.existsSync(recordingsPath)) fs.mkdirSync(recordingsPath, { recursive: true });
    const fileName = safeFileName(defaultFileName, `meeting-transcript-${Date.now()}.txt`);
    const filePath = path.join(recordingsPath, fileName);
    fs.writeFileSync(filePath, content || '', { encoding: 'utf8' });
    return { success: true, filePath };
  } catch (error) {
    console.error('Error saving transcript file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-mom', async (event, { meetingId, date, momTemplateName, transcriptFilePath, aiApiBaseUrl }) => {
  try {
    const normalizedAiApiBaseUrl = normalizeHttpBaseUrl(aiApiBaseUrl, 'https://ai.nexaois.com:4433');
    const generateMomUrl = `${normalizedAiApiBaseUrl}/generate-mom`;
    if (!transcriptFilePath || !fs.existsSync(transcriptFilePath)) return { status: 'error', error: 'Transcript not found' };
    const transcriptBuffer = fs.readFileSync(transcriptFilePath);
    const boundary = `----oismeet-mom-${Date.now().toString(16)}`;
    const parts = [];
    const addField = (n, v) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`));
    addField('meeting_id', meetingId || '');
    addField('date', date || formatDateDdMmYyyy(new Date()));
    addField('mom_template_name', momTemplateName || 'investor');
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="transcript_file"; filename="transcript.txt"\r\nContent-Type: text/plain\r\n\r\n`));
    parts.push(transcriptBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const response = await fetch(generateMomUrl, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(parts) });
    const payload = await (response.headers.get('content-type')?.includes('json') ? response.json() : response.text());
    return response.ok ? { status: 'success', result: payload } : { status: 'error', error: 'Request failed', details: payload };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('transcribe-audio-file', async (event, { buffer, fileName, aiApiBaseUrl }) => {
  try {
    const normalizedAiApiBaseUrl = normalizeHttpBaseUrl(aiApiBaseUrl, 'https://ai.nexaois.com:4433');
    const boundary = `----oismeet-${Date.now().toString(16)}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || 'audio.wav'}"\r\nContent-Type: audio/wav\r\n\r\n`),
      Buffer.from(new Uint8Array(buffer)),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const response = await fetch(`${normalizedAiApiBaseUrl}/transcribe`, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
    return response.ok ? await response.json() : { status: 'error', error: 'Transcription failed' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});
