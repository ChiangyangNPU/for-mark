/**
 * preload：向渲染层暴露类型安全的受控文件 API
 * 渲染层通过 window.tmdAPI 使用，无 Node 权限直接暴露。
 *
 * 暴露对象按 src/native.ts 的 NativeFileAPI 接口标注（tsc checkJs 校验）：
 * 与接口不一致（缺方法、签名不符）会在编译期报错。
 *
 * @author chiangyang
 */
const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('./ipc.cjs')

/** @type {import('../src/native.ts').NativeFileAPI} */
const api = {
  /** 是否在 Electron 环境中（浏览器里为 undefined，渲染层据此降级） */
  isNative: true,
  openFile: () => ipcRenderer.invoke(IPC.openFile),
  readFile: (filePath) => ipcRenderer.invoke(IPC.readFile, filePath),
  readDir: (dirPath) => ipcRenderer.invoke(IPC.readDir, dirPath),
  openFolder: () => ipcRenderer.invoke(IPC.openFolder),
  saveFile: (filePath, content) => ipcRenderer.invoke(IPC.saveFile, filePath, content),
  saveFileAs: (content) => ipcRenderer.invoke(IPC.saveFileAs, content),
  exportAs: (options) => ipcRenderer.invoke(IPC.exportAs, options),
  print: () => ipcRenderer.invoke(IPC.print),
  /** 向主进程同步未保存状态（用于关闭确认） */
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty),
  onMenu: (callback) => {
    ipcRenderer.on(IPC.menu, (_event, action) => callback(action))
  },
  /** 自动保存开关（菜单 checkbox 切换） */
  onAutosave: (callback) => {
    ipcRenderer.on(IPC.autosave, (_event, enabled) => callback(enabled))
  },
  /** 文件关联：Finder 双击 .md / 系统打开方式传入的文件路径 */
  onOpenPath: (callback) => {
    ipcRenderer.on(IPC.openPath, (_event, filePath) => callback(filePath))
  },
  /** 把当前语言的菜单文案发给主进程重建菜单 */
  setLocaleInfo: (labels) => ipcRenderer.send(IPC.setLocaleInfo, labels),
  /** 渲染层就绪信号：主进程补发排队中的待打开文件 */
  ready: () => ipcRenderer.send(IPC.ready),
  /** 设置面板同步自动保存开关（保持与菜单勾选一致） */
  setAutosaveEnabled: (enabled) => ipcRenderer.send(IPC.setAutosaveEnabled, enabled),
  /** 粘贴图片落盘：写入文档同目录 assets/ 文件夹 */
  saveImage: (options) => ipcRenderer.invoke(IPC.saveImage, options),
  /** 手动触发检查更新（设置面板"检查更新"按钮） */
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  /** 用户同意后触发下载 */
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload),
  /** 安装已下载的更新并重启 */
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  /** 监听主进程推送的更新状态变化 */
  onUpdateStatus: (callback) => {
    ipcRenderer.on(IPC.updateStatus, (_event, status) => callback(status))
  },
  /** 同步"启动时自动检查更新"开关给主进程 */
  setAutoCheckUpdate: (enabled) => ipcRenderer.send(IPC.updateAutoCheck, enabled),
  /** 同步主题给主进程：标题栏/窗口底色切换完成后返回，渲染层再切页面使两者视觉同步 */
  setThemeSource: (isDark) => ipcRenderer.invoke(IPC.setThemeSource, isDark),
}

contextBridge.exposeInMainWorld('tmdAPI', api)
