const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./src/main/ipc-handlers');

let mainWindow;
let splashWindow;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'splash.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0c14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }
}

// IPC: renderer signals it's ready
ipcMain.on('app:ready', () => {
  showMainWindow();
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createSplash();
  createWindow();

  // Fallback: show main window after 10s even if app:ready never fires
  setTimeout(() => {
    showMainWindow();
  }, 10000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
