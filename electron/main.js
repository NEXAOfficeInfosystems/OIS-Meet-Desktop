const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
// TEMP SSL BYPASS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ois.meet.desktop');
}

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
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    resizable: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // ── ADDED: allows window.open() calls inside Angular to be intercepted
      //           by the 'did-create-window' / setWindowOpenHandler API and
      //           also ensures our IPC-based openMeetingWindow works correctly.
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
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    return;
  }

  appTray = new Tray(iconPath);
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
  // Automatically grant camera/microphone permissions in Electron
  const { session } = require('electron');
  
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Open a dedicated BrowserWindow for a meeting ─────────────────────────────
//
// Payload shape sent from preload.js → Angular:
//   { routePath: string, queryString: string }
//     routePath   – e.g.  "/meeting/OIS-XXXX"
//     queryString – e.g.  "host=false&topic=OIS+Meet&mic=false&cam=false"
//
// OR (legacy / dev-server):
//   A full http(s):// URL string
//
// In production (loadFile) window.location.origin is "null" so Angular can
// no longer build a proper absolute URL. We therefore accept the structured
// payload and resolve the path ourselves using loadFile() + URLSearchParams.
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.on('open-meeting-window', (event, payload) => {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  const meetingWindow = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    title:     'OIS Meet — Meeting',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      nativeWindowOpen: true,
    }
  });

  meetingWindow.setMenuBarVisibility(false);

  // ── Determine how to load the meeting route ──────────────────────────────
  if (payload && typeof payload === 'object' && payload.routePath) {
    // Structured payload — used by production EXE (file:// context)
    const { routePath, queryString } = payload;

    if (process.env.ELECTRON_START_URL) {
      // Dev server — Angular uses HashLocationStrategy, so prefix route with '/#'
      const devBase = process.env.ELECTRON_START_URL.replace(/\/$/, '');
      const fullUrl = queryString
        ? `${devBase}/#${routePath}?${queryString}`
        : `${devBase}/#${routePath}`;
      console.log('[main] Meeting window loadURL (dev, hash):', fullUrl);
      void meetingWindow.loadURL(fullUrl);
    } else {
      // Production — load Angular entry point via loadFile, then navigate
      const indexPath = path.join(
        app.getAppPath(), 'dist', 'ois-meet-desktop', 'browser', 'index.html'
      );
      const hashPath = queryString
        ? `${routePath}?${queryString}`
        : routePath;
      console.log('[main] Meeting window loadFile (prod), hash:', hashPath);
      void meetingWindow.loadFile(indexPath, { hash: hashPath });
    }
  } else if (typeof payload === 'string' && /^https?:\/\//i.test(payload)) {
    // Legacy string URL — inject '#' for HashLocationStrategy if missing
    const legacyUrl = payload.replace(/(https?:\/\/[^/#]+)(\/)/, '$1/#/');
    console.log('[main] Meeting window loadURL (legacy):', legacyUrl);
    void meetingWindow.loadURL(legacyUrl);
  } else {
    console.warn('[main] open-meeting-window: invalid payload, ignoring:', payload);
    meetingWindow.destroy();
    return;
  }

  // ── Warn before closing a live meeting window ────────────────────────────
  meetingWindow.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(meetingWindow, {
      type:      'question',
      buttons:   ['Leave Meeting', 'Cancel'],
      title:     'Leave Meeting?',
      message:   'Are you sure you want to leave the meeting?',
      defaultId: 1,
      cancelId:  1,
    });

    if (choice === 1) {
      e.preventDefault(); // User clicked Cancel → keep window open
    }
  });

  meetingWindow.webContents.on('did-finish-load', () => {
    console.log('[main] Meeting window finished loading.');
    // Forward any cached auth data to the meeting window renderer so it
    // can restore session/localStorage before Angular boot logic runs.
    try {
      if (storedAuthData) {
        meetingWindow.webContents.send('electron-auth-data', storedAuthData);
      }
    } catch (err) {
      console.error('[main] Failed to forward auth data to meeting window:', err);
    }
  });

  meetingWindow.webContents.on('did-fail-load', (ev, code, desc) => {
    console.error('[main] Meeting window failed to load:', code, desc);
  });
});

// Close the meeting window from renderer without showing the "Leave Meeting" dialog.
ipcMain.on('close-meeting-window', (event, { force } = { force: false }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    if (force) {
      // Forcefully destroy (no close events)
      win.destroy();
    } else {
      // Normal close (will trigger 'close' handler which may prompt)
      win.close();
    }
  } catch (err) {
    console.error('[main] Error closing meeting window:', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING IPC HANDLERS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('show-native-notification', async (event, { title, body }) => {
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications are not supported on this system' };
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    const notification = new Notification({
      title:  typeof title === 'string' && title.trim() ? title.trim() : 'OIS Meet',
      body:   typeof body  === 'string' ? body : '',
      icon:   fs.existsSync(iconPath) ? iconPath : undefined,
      appID:  'com.ois.meet.desktop',
      silent: false
    });

    notification.show();
    return { success: true };
  } catch (error) {
    console.error('Error showing native notification:', error);
    return { success: false, error: error && error.message ? error.message : 'Failed to show notification' };
  }
});

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

ipcMain.handle('save-transcript-text-file', async (event, { content, defaultFileName }) => {
  try {
    const recordingsPath = path.join(app.getPath('documents'), 'OIS-Meet-Recordings');
    if (!fs.existsSync(recordingsPath)) {
      fs.mkdirSync(recordingsPath, { recursive: true });
    }

    const fileName = safeFileName(defaultFileName, `meeting-transcript-${Date.now()}.txt`);
    const filePath = path.join(recordingsPath, fileName);

    const text = typeof content === 'string' ? content : '';
    fs.writeFileSync(filePath, text, { encoding: 'utf8' });

    return { success: true, filePath };
  } catch (error) {
    console.error('Error saving transcript text file:', error);
    return { success: false, error: error && error.message ? error.message : 'Failed to save transcript file' };
  }
});

ipcMain.handle('generate-mom', async (event, { meetingId, date, momTemplateName, transcriptFilePath, aiApiBaseUrl }) => {
  try {
    const normalizedAiApiBaseUrl = normalizeHttpBaseUrl(
      aiApiBaseUrl,
      process.env.AI_API_BASE_URL || 'https://ai.nexaois.com:4433'
    );
    const generateMomUrl = `${normalizedAiApiBaseUrl}/generate-mom`;

    const resolvedTranscriptPath = typeof transcriptFilePath === 'string' ? transcriptFilePath : '';
    if (!resolvedTranscriptPath || !fs.existsSync(resolvedTranscriptPath)) {
      return { status: 'error', error: 'Transcript file not found' };
    }

    const transcriptBuffer     = fs.readFileSync(resolvedTranscriptPath);
    const transcriptUploadName = safeFileName(path.basename(resolvedTranscriptPath), 'meeting-transcription.txt');

    const boundary        = `----oismeet-mom-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const meetingIdValue  = typeof meetingId === 'string' ? meetingId : '';
    const dateValue       = typeof date === 'string' && date.trim() ? date.trim() : formatDateDdMmYyyy(new Date());
    const momTemplateValue = typeof momTemplateName === 'string' && momTemplateName.trim() ? momTemplateName.trim() : 'investor';

    const parts = [];
    const addField = (name, value) => {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`,
        'utf8'
      ));
    };

    addField('meeting_id',        meetingIdValue);
    addField('date',              dateValue);
    addField('mom_template_name', momTemplateValue);

    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="transcript_file"; filename="${transcriptUploadName}"\r\n` +
      `Content-Type: text/plain\r\n\r\n`,
      'utf8'
    ));
    parts.push(Buffer.from(transcriptBuffer));
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    const body = Buffer.concat(parts);

    const response = await fetch(generateMomUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });

    const contentType = response.headers.get('content-type') || '';
    const payload     = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      return {
        status: 'error',
        error:  `Generate MoM request failed (${response.status} ${response.statusText})`,
        details: payload
      };
    }

    return { status: 'success', result: payload };
  } catch (error) {
    console.error('Error calling generate-mom service (main):', error);
    return { status: 'error', error: error && error.message ? error.message : 'Error calling generate-mom service' };
  }
});

ipcMain.handle('transcribe-audio-file', async (event, { buffer, fileName, aiApiBaseUrl }) => {
  try {
    const normalizedAiApiBaseUrl = normalizeHttpBaseUrl(
      aiApiBaseUrl,
      process.env.AI_API_BASE_URL || 'https://ai.nexaois.com:4433'
    );
    const transcriptionUrl = `${normalizedAiApiBaseUrl}/transcribe`;
    console.log('AI Base URL used for transcription Main.js:', transcriptionUrl);

    const uint8Array     = new Uint8Array(buffer);
    const safeFile       = fileName || 'meeting-recording.wav';
    const boundary       = `----oismeet-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFile}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header, 'utf8'),
      Buffer.from(uint8Array),
      Buffer.from(footer, 'utf8')
    ]);

    const response = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        filename: fileName,
        status:   'error',
        error:    `Transcription request failed (${response.status} ${response.statusText})${text ? `: ${text}` : ''}`
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling transcription service (main):', error);
    return {
      filename: fileName,
      status:   'error',
      error:    error && error.message ? error.message : 'Error calling transcription service'
    };
  }
});

