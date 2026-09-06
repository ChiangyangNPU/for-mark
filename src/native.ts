/**
 * Electron 原生能力（preload 注入）的类型与引用
 *
 * 渲染层与壳层之间的唯一契约：编辑器代码只依赖本接口，
 * 不直接接触任何 Electron API，保证壳层可替换（如未来迁移 Tauri）。
 * 浏览器环境下 window.forMarkAPI 不存在，各功能模块据此降级。
 *
 * @author chiangyang
 */

export interface NativeFileAPI {
  isNative: true
  openFile(): Promise<{ path: string; name: string; content: string } | null>
  readFile(filePath: string): Promise<{ path: string; name: string; content: string }>
  readDir(dirPath: string): Promise<{ path: string; name: string; children: import('./filetree').FileEntry[] } | null>
  openFolder(): Promise<string | null>
  saveFile(filePath: string, content: string): Promise<boolean>
  saveFileAs(content: string): Promise<{ path: string; name: string } | null>
  exportAs(options: { content: string; defaultName: string; filters: { name: string; extensions: string[] }[] }): Promise<{ path: string; name: string } | null>
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
}

declare global {
  interface Window {
    forMarkAPI?: NativeFileAPI
  }
}

export const native = window.forMarkAPI
