const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, session, nativeImage, desktopCapturer } = electron;
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Auto Updater Configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Dynamic Update URL Override (e.g. for OneDrive updates)
const updateConfigPath = path.join(app.getPath('userData'), 'update-config.json');
if (fs.existsSync(updateConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(updateConfigPath, 'utf8'));
    if (config.updateUrl) {
      console.log('[Updater] Overriding update URL:', config.updateUrl);
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: config.updateUrl
      });
    }
  } catch (err) {
    console.error('[Updater] Failed to parse update-config.json:', err);
  }
}

// ── OPTION B: SharePoint/OneDrive Direct Link Support ──
// Intercept update requests to transform SharePoint sharing links into direct download streams.
app.whenReady().then(() => {
  const sharepointDomain = 'netorgft12643612-my.sharepoint.com';
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: [`*://${sharepointDomain}/*`] },
    (details, callback) => {
      let url = details.url;
      // If it's an update check or download, ensure it's a direct download request
      if (url.includes('latest.yml') || url.includes('.exe') || url.includes('.blockmap')) {
        // Clean up any double slashes or query parameter issues
        url = url.replace(/\/\//g, '/').replace(':/', '://');
        if (!url.includes('download=1')) {
          url += (url.includes('?') ? '&' : '?') + 'download=1';
        }
        console.log('[Updater] Redirecting to Direct Download:', url);
        return callback({ redirectURL: url });
      }
      callback({});
    }
  );
});


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

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    return { success: true, result };
  } catch (error) {
    console.error('[Updater] Manual check failed:', error);
    return { success: false, error: error.message };
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

ipcMain.on('win:focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

let mainWindow;
let meetingWindow;
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

ipcMain.handle('is-meeting-active', () => {
  return meetingWindow && !meetingWindow.isDestroyed();
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

  // When the window is hidden (goes to tray) there is no visible UI to accept or
  // dismiss an incoming call, so the Web Audio ring would play silently for the
  // full 60-second timeout.  Tell the renderer to stop its ringtone immediately.
  mainWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-hidden-stop-ringtone');
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
  // Grant media + display-capture permissions so getUserMedia (camera/mic) and
  // the desktopCapturer-backed screen share both work without an OS prompt.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'display-capture'].includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['media', 'display-capture'].includes(permission));
  });

  // Allow renderer's getDisplayMedia() to work in Electron 17+.
  // Without this handler getDisplayMedia() always throws in Electron.
  // We grab all screen + window sources and hand back the primary screen.
  // The renderer can also call the `get-desktop-sources` IPC to build its
  // own source-picker UI and then use getUserMedia() directly.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const primary = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      callback(primary ? { video: primary } : {});
    } catch (err) {
      console.error('[main] setDisplayMediaRequestHandler error:', err);
      callback({});
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
  if (meetingWindow && !meetingWindow.isDestroyed()) {
    meetingWindow.show();
    meetingWindow.focus();
    return;
  }

  meetingWindow = new BrowserWindow({
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
    meetingWindow = null;
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

  meetingWindow.on('closed', () => {
    meetingWindow = null;
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

// ── Desktop source picker (used by renderer screen-share fallback) ──────────
ipcMain.handle('get-desktop-sources', async (_event, opts) => {
  try {
    const types = (opts && Array.isArray(opts.types)) ? opts.types : ['screen', 'window'];
    const sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: { width: 320, height: 180 }
    });
    // Serialise only what the renderer needs (avoid passing non-cloneable objects).
    return sources.map(s => ({
      id:        s.id,
      name:      s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  } catch (err) {
    console.error('[main] get-desktop-sources failed:', err);
    return [];
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN RECORDING FLOATING CONTROLS WINDOW
// ─────────────────────────────────────────────────────────────────────────────

let recordingControlsWindow = null;

ipcMain.handle('show-recording-controls', async (_event) => {
  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    recordingControlsWindow.showInactive();
    return;
  }

  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const W = 360, H = 56;

  recordingControlsWindow = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round((width - W) / 2),
    y: height - H - 12,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'recording-controls-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  recordingControlsWindow.loadFile(path.join(__dirname, 'recording-controls.html'));

  recordingControlsWindow.on('closed', () => {
    recordingControlsWindow = null;
  });
});

ipcMain.on('update-recording-controls', (_event, state) => {
  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    recordingControlsWindow.webContents.send('recording-state-update', state);
  }
});

ipcMain.on('hide-recording-controls', (_event) => {
  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    try { recordingControlsWindow.close(); } catch (_) {}
    recordingControlsWindow = null;
  }
});

// Actions from the floating window (pause / stop / cancel) → forward to main renderer
ipcMain.on('recording-control-action', (_event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-control-action', action);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('show-native-notification', async (event, { title, body, silent }) => {
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications are not supported on this system' };
    }
    // The Web Audio API ring in the renderer already provides the call alert sound,
    // so OS notifications are silent by default to avoid a double "ding".
    // Pass silent=false explicitly from the caller only when no in-app sound plays.
    const notification = new Notification({
      title:  typeof title === 'string' && title.trim() ? title.trim() : 'OIS Meet',
      body:   typeof body  === 'string' ? body : '',
      icon:   APP_ICON || undefined,
      appID:  APP_ID,
      silent: silent !== false  // true unless the caller explicitly opts in to OS sound
    });

    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
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
