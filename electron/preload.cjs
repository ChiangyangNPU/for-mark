/**
 * preload：向渲染层暴露类型安全的受控文件 API
 * 渲染层通过 window.tmdAPI 使用，无 Node 权限直接暴露。
 * 与 src/native.ts 中的 NativeFileAPI 接口一一对应。
 *
 * @author chiangyang
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tmdAPI', {
  /** 是否在 Electron 环境中（浏览器里为 undefined，渲染层据此降级） */
  isNative: true,
  openFile: () => ipcRenderer.invoke('tmd:open-file'),
  readFile: (filePath) => ipcRenderer.invoke('tmd:read-file', filePath),
  readDir: (dirPath) => ipcRenderer.invoke('tmd:read-dir', dirPath),
  openFolder: () => ipcRenderer.invoke('tmd:open-folder'),
  saveFile: (filePath, content) => ipcRenderer.invoke('tmd:save-file', filePath, content),
  saveFileAs: (content) => ipcRenderer.invoke('tmd:save-file-as', content),
  exportAs: (options) => ipcRenderer.invoke('tmd:export-as', options),
  print: () => ipcRenderer.invoke('tmd:print'),
  /** 向主进程同步未保存状态（用于关闭确认） */
  setDirty: (dirty) => ipcRenderer.send('tmd:set-dirty', dirty),
  onMenu: (callback) => {
    ipcRenderer.on('tmd:menu', (_event, action) => callback(action))
  },
  /** 自动保存开关（菜单 checkbox 切换） */
  onAutosave: (callback) => {
    ipcRenderer.on('tmd:autosave', (_event, enabled) => callback(enabled))
  },
  /** 文件关联：Finder 双击 .md / 系统打开方式传入的文件路径 */
  onOpenPath: (callback) => {
    ipcRenderer.on('tmd:open-path', (_event, filePath) => callback(filePath))
  },
  /** 把当前语言的菜单文案发给主进程重建菜单 */
  setLocaleInfo: (labels) => ipcRenderer.send('tmd:set-locale-info', labels),
  /** 渲染层就绪信号：主进程补发排队中的待打开文件 */
  ready: () => ipcRenderer.send('tmd:ready'),
  /** 设置面板同步自动保存开关（保持与菜单勾选一致） */
  setAutosaveEnabled: (enabled) => ipcRenderer.send('tmd:set-autosave-enabled', enabled),
  /** 粘贴图片落盘：写入文档同目录 assets/ 文件夹 */
  saveImage: (options) => ipcRenderer.invoke('tmd:save-image', options),
})
