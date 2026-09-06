/**
 * preload：向渲染层暴露类型安全的受控文件 API
 * 渲染层通过 window.forMarkAPI 使用，无 Node 权限直接暴露。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forMarkAPI', {
  /** 是否在 Electron 环境中（浏览器里为 undefined，渲染层据此降级） */
  isNative: true,
  openFile: () => ipcRenderer.invoke('for-mark:open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('for-mark:save-file', filePath, content),
  saveFileAs: (content) => ipcRenderer.invoke('for-mark:save-file-as', content),
  onMenu: (callback) => {
    ipcRenderer.on('for-mark:menu-open', () => callback('open'))
    ipcRenderer.on('for-mark:menu-save', () => callback('save'))
    ipcRenderer.on('for-mark:menu-save-as', () => callback('save-as'))
  },
})
