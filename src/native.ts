/**
 * Electron 原生能力（preload 注入）的类型与引用
 * 浏览器环境下 window.forMarkAPI 不存在，各功能模块据此降级。
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
  onMenu(callback: (action: string) => void): void
  onAutosave(callback: (enabled: boolean) => void): void
}

declare global {
  interface Window {
    forMarkAPI?: NativeFileAPI
  }
}

export const native = window.forMarkAPI
