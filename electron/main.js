/* ============================================================
   MirrorPlay · Electron 主进程
   无边框自定义标题栏 + 加载本地 index.html + 真实窗口控制
   ============================================================ */
'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');

const APP_NAME = 'MirrorPlay';
let mainWin = null;

/* 单实例 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    frame: false,                    // 使用应用内自定义标题栏
    backgroundColor: '#070b12',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.loadFile(path.join(__dirname, '..', 'index.html'));

  /* 应用元信息（版本 / 平台）下发给渲染层 */
  mainWin.webContents.on('did-finish-load', () => {
    mainWin.webContents.send('app-meta', {
      version: app.getVersion(),
      platform: process.platform,          // win32 | linux
      arch: process.arch,
      electron: process.versions.electron,
      packaged: app.isPackaged,
    });
  });

  /* 窗口状态广播（最大化按钮图标同步） */
  const sendWinState = () => {
    if (mainWin) mainWin.webContents.send('win-state', { maximized: mainWin.isMaximized() });
  };
  mainWin.on('maximize', sendWinState);
  mainWin.on('unmaximize', sendWinState);

  /* 外链用系统浏览器打开 */
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  /* 去掉默认菜单；开发模式下 F12 开 DevTools */
  Menu.setApplicationMenu(null);
  if (!app.isPackaged) {
    mainWin.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') mainWin.webContents.toggleDevTools();
    });
  }
}

/* 窗口控制 IPC */
ipcMain.on('window-control', (event, action) => {
  if (!mainWin) return;
  switch (action) {
    case 'minimize': mainWin.minimize(); break;
    case 'toggle-maximize':
      if (mainWin.isMaximized()) mainWin.unmaximize();
      else mainWin.maximize();
      break;
    case 'close': mainWin.close(); break;
  }
});
