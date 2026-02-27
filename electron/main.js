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
