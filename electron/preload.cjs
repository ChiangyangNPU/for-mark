/**
 * preload：向渲染层暴露类型安全的受控文件 API
 * 渲染层通过 window.forMarkAPI 使用，无 Node 权限直接暴露。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forMarkAPI', {
  /** 是否在 Electron 环境中（浏览器里为 undefined，渲染层据此降级） */
  isNative: true,
  openFile: () => ipcRenderer.invoke('for-mark:open-file'),
  readFile: (filePath) => ipcRenderer.invoke('for-mark:read-file', filePath),
  readDir: (dirPath) => ipcRenderer.invoke('for-mark:read-dir', dirPath),
  openFolder: () => ipcRenderer.invoke('for-mark:open-folder'),
  saveFile: (filePath, content) => ipcRenderer.invoke('for-mark:save-file', filePath, content),
  saveFileAs: (content) => ipcRenderer.invoke('for-mark:save-file-as', content),
  exportAs: (options) => ipcRenderer.invoke('for-mark:export-as', options),
  print: () => ipcRenderer.invoke('for-mark:print'),
  onMenu: (callback) => {
    ipcRenderer.on('for-mark:menu', (_event, action) => callback(action))
  },
  /** 自动保存开关（菜单 checkbox 切换） */
  onAutosave: (callback) => {
    ipcRenderer.on('for-mark:autosave', (_event, enabled) => callback(enabled))
  },
})
