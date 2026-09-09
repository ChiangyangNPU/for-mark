/**
 * 持久化存储：localStorage 键与读写的统一入口（零运行时依赖）
 *
 * - doc：崩溃恢复副本（每次内容变更写入，与磁盘保存无关）
 * - theme / recent / img / autosave：偏好与开关
 */
import type { ImageStrategy } from './paste-image'

// 注意：electron/main.cjs「放弃修改并关闭」路径硬编码了此键名，改键时须同步
export const DOC_KEY = 'tmd:doc:v1'
export const THEME_KEY = 'tmd:theme'
export const RECENT_KEY = 'tmd:recent'
export const IMAGE_STRATEGY_KEY = 'tmd:img'
export const AUTOSAVE_KEY = 'tmd:autosave'
export const LOCALE_KEY = 'tmd:lang'

/** 文档内容写入恢复副本 */
export function saveDoc(markdown: string) {
  localStorage.setItem(DOC_KEY, markdown)
}

/** 读取恢复副本；无则返回 null */
export function loadDoc(): string | null {
  return localStorage.getItem(DOC_KEY)
}

/** 清除恢复副本（保存成功 / 干净退出 / 用户放弃修改） */
export function clearDoc() {
  localStorage.removeItem(DOC_KEY)
}

export function getTheme(): 'dark' | 'light' {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export function setTheme(isDark: boolean) {
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
}

export interface RecentEntry {
  name: string
  path: string
}

/** 最近打开文件列表（最多 8 条，最新在前） */
export function recentList(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** 记录一条最近打开（同路径去重后置顶）；调用方负责刷新侧边栏 UI */
export function pushRecent(path: string, name: string) {
  const list = recentList().filter((r) => r.path !== path)
  list.unshift({ path, name })
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
}

export function getImageStrategy(): ImageStrategy {
  return localStorage.getItem(IMAGE_STRATEGY_KEY) === 'assets' ? 'assets' : 'inline'
}

export function setImageStrategy(strategy: ImageStrategy) {
  localStorage.setItem(IMAGE_STRATEGY_KEY, strategy)
}

export function getAutosaveEnabled(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) === 'true'
}

export function setAutosaveEnabled(enabled: boolean) {
  localStorage.setItem(AUTOSAVE_KEY, enabled ? 'true' : 'false')
}
