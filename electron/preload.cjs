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
  /** 向主进程同步未保存状态（用于关闭确认） */
  setDirty: (dirty) => ipcRenderer.send('for-mark:set-dirty', dirty),
  onMenu: (callback) => {
    ipcRenderer.on('for-mark:menu', (_event, action) => callback(action))
  },
  /** 自动保存开关（菜单 checkbox 切换） */
  onAutosave: (callback) => {
    ipcRenderer.on('for-mark:autosave', (_event, enabled) => callback(enabled))
  },
  /** 文件关联：Finder 双击 .md / 系统打开方式传入的文件路径 */
  onOpenPath: (callback) => {
    ipcRenderer.on('for-mark:open-path', (_event, filePath) => callback(filePath))
  },
  /** 把当前语言的菜单文案发给主进程重建菜单 */
  setLocaleInfo: (labels) => ipcRenderer.send('for-mark:set-locale-info', labels),
  /** 渲染层就绪信号：主进程补发排队中的待打开文件 */
  ready: () => ipcRenderer.send('for-mark:ready'),
})
