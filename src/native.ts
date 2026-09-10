/**
 * Electron 原生能力（preload 注入）的类型与引用
 *
 * 渲染层与壳层之间的唯一契约：编辑器代码只依赖本接口，
 * 不直接接触任何 Electron API，保证壳层可替换（如未来迁移 Tauri）。
 * 浏览器环境下 window.tmdAPI 不存在，各功能模块据此降级。
 *
 * @author chiangyang
 */

export interface NativeFileAPI {
  isNative: true
  openFile(): Promise<{ path: string; name: string; content: string } | null>
  readFile(filePath: string): Promise<{ path: string; name: string; content: string }>
  readDir(
    dirPath: string,
  ): Promise<{ path: string; name: string; children: import('./filetree').FileEntry[] } | null>
  openFolder(): Promise<string | null>
  saveFile(filePath: string, content: string): Promise<boolean>
  saveFileAs(content: string): Promise<{ path: string; name: string } | null>
  exportAs(options: {
    content: string
    defaultName: string
    filters: { name: string; extensions: string[] }[]
  }): Promise<{ path: string; name: string } | null>
  print(): Promise<boolean>
  /** 向主进程同步未保存状态（用于关闭确认） */
  setDirty(dirty: boolean): void
  onMenu(callback: (action: string) => void): void
  onAutosave(callback: (enabled: boolean) => void): void
  /** 文件关联：Finder 双击 .md / 系统打开方式传入的文件路径 */
  onOpenPath(callback: (filePath: string) => void): void
  /** 把当前语言的菜单栏文案发给主进程重建菜单 */
  setLocaleInfo(labels: Record<string, string>): void
  /** 渲染层就绪信号：主进程补发排队中的待打开文件 */
  ready(): void
  /** 设置面板同步自动保存开关（保持与菜单勾选一致） */
  setAutosaveEnabled(enabled: boolean): void
  /** 粘贴图片落盘：写入 dir/assets/name，返回实际文件名 */
  saveImage(options: {
    dir: string
    name: string
    base64: string
  }): Promise<{ name: string } | null>
  /** 手动触发检查更新（设置面板"检查更新"按钮） */
  checkForUpdates(): Promise<void>
  /** 用户同意后触发下载 */
  downloadUpdate(): void
  /** 安装已下载的更新并重启 */
  installUpdate(): void
  /** 监听主进程推送的更新状态变化 */
  onUpdateStatus(callback: (status: UpdateStatus) => void): void
  /** 同步"启动时自动检查更新"开关给主进程 */
  setAutoCheckUpdate(enabled: boolean): void
}

/**
 * 更新状态：主进程通过 IPC 推送给渲染层，渲染层据此更新设置面板 UI。
 * 弹窗确认（是否下载 / 下载完成重启）由主进程用原生 dialog 处理。
 */
export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded' }
  | { status: 'error'; message: string }

declare global {
  interface Window {
    tmdAPI?: NativeFileAPI
  }
}

export const native = window.tmdAPI

/**
 * IPC 通道名表：主进程与 preload 共用。
 * 实际常量在 electron/ipc.cjs（JS 模块，Electron 直接 require 无需编译），
 * 该文件用 JSDoc 标注为本接口——tsc checkJs 保证两侧键名对齐，
 * 改通道名时只改这一处。
 */
export interface IpcChannels {
  openFile: string
  readFile: string
  readDir: string
  openFolder: string
  saveFile: string
  saveFileAs: string
  exportAs: string
  print: string
  setDirty: string
  menu: string
  autosave: string
  openPath: string
  setLocaleInfo: string
  ready: string
  setAutosaveEnabled: string
  saveImage: string
  updateCheck: string
  updateStatus: string
  updateDownload: string
  updateInstall: string
  updateAutoCheck: string
}
