/**
 * 主题切换：CSS 变量 + mermaid 主题 + 图表原地重渲。
 *
 * 不再重建编辑器——SVG 内嵌旧主题配色时由 reThemeMermaid() 原地重画，
 * 保住撤销历史、焦点与滚动位置（重建方案的历史遗留问题）。
 */
import { setTheme } from './store'
import { setMermaidTheme, reThemeMermaid } from './mermaid'
import { native } from './native'

/** 串行化：快速连续切换时避免渲染互相踩踏 */
let themeApplying: Promise<void> = Promise.resolve()

export function applyTheme(isDark: boolean): Promise<void> {
  themeApplying = themeApplying
    .then(() => doApplyTheme(isDark))
    .catch((err) => console.error('[tmd] 主题切换失败', err))
  return themeApplying
}

async function doApplyTheme(isDark: boolean) {
  // 先切壳层（原生标题栏/窗口底色），等 IPC 返回后渲染层再翻页面——
  // 两者落在同一视觉瞬间，避免"页面已变、标题栏慢半拍"的差异感
  await native?.setThemeSource(isDark)
  document.body.classList.toggle('dark', isDark)
  setTheme(isDark)
  const button = document.getElementById('theme-toggle')
  if (button) button.textContent = isDark ? '☀️' : '🌙'
  setMermaidTheme(isDark ? 'dark' : 'default')
  reThemeMermaid()
}

/** 当前是否深色主题（设置面板反射用） */
export function isDarkTheme(): boolean {
  return document.body.classList.contains('dark')
}
