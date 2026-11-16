const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, safeStorage } = require('electron');
const ai = require('./ai.cjs');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#EAF1FD',
    title: 'Ranking',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') }
  });
  win.setAspectRatio(16 / 9);
  // Windows sends the mouse back/forward buttons as app commands; pass them to the page.
  win.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      e.preventDefault();
      win.webContents.executeJavaScript("window.dispatchEvent(new CustomEvent('ranking-nav', { detail: " + (cmd === 'browser-backward' ? -1 : 1) + " }))").catch(() => {});
    }
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          minWidth: 800,
          minHeight: 450,
          autoHideMenuBar: true,
          title: 'Ranking – Standings',
          backgroundColor: '#EAF1FD'
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://ranking/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const full = path.normalize(path.join(DIST, rel));
    if (!full.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  ai.register(ipcMain, app, safeStorage, net);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
