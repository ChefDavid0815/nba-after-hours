const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'));
const userData = path.join(portableRoot, 'userdata');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setName('NBA After Hours');
if(process.env.NBA_HEADLESS_TEST){app.commandLine.appendSwitch('disable-renderer-backgrounding');app.commandLine.appendSwitch('disable-background-timer-throttling');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  const createWindow = () => {
    window = new BrowserWindow({
      title: 'NBA After Hours / 决胜时刻',
      icon: path.join(__dirname, 'icon.png'),
      width: 1440, height: 900, minWidth: 800, minHeight: 560,
      backgroundColor: '#0b1018', show: false, autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: !process.env.NBA_HEADLESS_TEST },
    });
    Menu.setApplicationMenu(null);
    window.once('ready-to-show', () => { if (!process.env.NBA_HEADLESS_TEST) window.show();else if(process.env.NBA_VISIBLE_TEST)window.showInactive(); });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file://')) event.preventDefault(); });
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11') { window.setFullScreen(!window.isFullScreen()); event.preventDefault(); }
    });
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  };
  app.whenReady().then(() => { if(process.platform==='win32')app.setAppUserModelId('local.nba-after-hours.game');createWindow(); });
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
