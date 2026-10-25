/* ============================================================
   MirrorPlay · 预加载脚本（contextBridge 安全桥接）
   ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  /* 窗口控制 */
  control: (action) => ipcRenderer.send('window-control', action),

  /* 订阅应用元信息（版本 / 平台） */
  onMeta: (cb) => {
    const handler = (_e, meta) => cb(meta);
    ipcRenderer.on('app-meta', handler);
    return () => ipcRenderer.removeListener('app-meta', handler);
  },

  /* 订阅窗口最大化状态 */
  onWinState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('win-state', handler);
    return () => ipcRenderer.removeListener('win-state', handler);
  },
});
