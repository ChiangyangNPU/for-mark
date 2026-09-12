/**
 * 主题预设与自定义 CSS
 *
 * - 预设是一组 CSS 变量覆盖，经 <style id="theme-preset-style"> 注入；
 *   浅色变量限定 html[data-theme-preset]:not(.dark)，深色限定
 *   html[data-theme-preset].dark——保证深浅模式各自正确覆盖且不串扰
 * - 自定义 CSS 经 <style id="custom-css-style"> 注入，位于预设之后，
 *   同优先级下可覆盖预设；用户可引用预设定义的任意 CSS 变量
 * - 变更即时生效（纯 CSS 变量层，不触碰编辑器实例）
 *
 * @author chiangyang
 */
import { getThemePreset, setThemePreset, getCustomCss, setCustomCss } from './store'

export interface ThemePreset {
  id: string
  /** i18n 键（settings.presetXxx） */
  nameKey: string
  /** 注入的 CSS 变量覆盖；default 为空串（使用 style.css 内建配色） */
  css: string
}

/** 深浅两套变量覆盖的模板 */
function presetCss(light: Record<string, string>, dark: Record<string, string>, id: string): string {
  const vars = (set: Record<string, string>) =>
    Object.entries(set)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n')
  return `html[data-theme-preset='${id}']:not(.dark) {\n  color-scheme: light;\n${vars(light)}\n}\n\nhtml[data-theme-preset='${id}'].dark {\n  color-scheme: dark;\n${vars(dark)}\n}`
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default', nameKey: 'settings.presetDefault', css: '' },
  {
    id: 'sepia',
    nameKey: 'settings.presetSepia',
    css: presetCss(
      {
        '--bg': '#f7f1e3',
        '--fg': '#433422',
        '--muted': '#8a7a5c',
        '--border': '#e0d5b8',
        '--accent': '#b07d2b',
        '--code-bg': '#efe6cf',
        '--pre-bg': '#f0e8d0',
        '--quote-bg': '#f2ead6',
        '--toolbar-bg': 'rgba(247, 241, 227, 0.85)',
        '--error-fg': '#c0392b',
        '--error-bg': '#fbeee8',
      },
      {
        '--bg': '#2b2620',
        '--fg': '#d8cfc0',
        '--muted': '#948a78',
        '--border': '#453d30',
        '--accent': '#d4a24e',
        '--code-bg': '#353026',
        '--pre-bg': '#302a22',
        '--quote-bg': '#353026',
        '--toolbar-bg': 'rgba(43, 38, 32, 0.85)',
        '--error-fg': '#f97583',
        '--error-bg': '#3a2a26',
      },
      'sepia',
    ),
  },
  {
    id: 'green',
    nameKey: 'settings.presetGreen',
    css: presetCss(
      {
        '--bg': '#cce8cf',
        '--fg': '#1f3323',
        '--muted': '#5f7a64',
        '--border': '#a8cbb0',
        '--accent': '#2e7d32',
        '--code-bg': '#b8dcc0',
        '--pre-bg': '#bde0c4',
        '--quote-bg': '#bfe0c5',
        '--toolbar-bg': 'rgba(204, 232, 207, 0.85)',
        '--error-fg': '#c0392b',
        '--error-bg': '#f3e3e0',
      },
      {
        '--bg': '#1d2a20',
        '--fg': '#cfe3d2',
        '--muted': '#86a18c',
        '--border': '#2f4034',
        '--accent': '#6fbf7f',
        '--code-bg': '#243328',
        '--pre-bg': '#203024',
        '--quote-bg': '#243328',
        '--toolbar-bg': 'rgba(29, 42, 32, 0.85)',
        '--error-fg': '#f97583',
        '--error-bg': '#33272a',
      },
      'green',
    ),
  },
  {
    id: 'github',
    nameKey: 'settings.presetGithub',
    css: presetCss(
      {
        '--bg': '#ffffff',
        '--fg': '#1f2328',
        '--muted': '#656d76',
        '--border': '#d0d7de',
        '--accent': '#0969da',
        '--code-bg': '#eff1f3',
        '--pre-bg': '#f6f8fa',
        '--quote-bg': '#f6f8fa',
        '--toolbar-bg': 'rgba(255, 255, 255, 0.85)',
        '--error-fg': '#d1242f',
        '--error-bg': '#ffebe9',
      },
      {
        '--bg': '#0d1117',
        '--fg': '#e6edf3',
        '--muted': '#7d8590',
        '--border': '#30363d',
        '--accent': '#2f81f7',
        '--code-bg': '#161b22',
        '--pre-bg': '#161b22',
        '--quote-bg': '#161b22',
        '--toolbar-bg': 'rgba(13, 17, 23, 0.85)',
        '--error-fg': '#f85149',
        '--error-bg': '#3c1614',
      },
      'github',
    ),
  },
]

/** 应用主题预设：写入 html[data-theme-preset] 并注入对应变量覆盖 */
export function applyThemePreset(id: string): void {
  const preset = THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0]
  if (preset.id === 'default') {
    delete document.documentElement.dataset.themePreset
  } else {
    document.documentElement.dataset.themePreset = preset.id
  }
  let style = document.getElementById('theme-preset-style') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'theme-preset-style'
    document.head.appendChild(style)
  }
  style.textContent = preset.css
}

/** 读取当前主题预设 id */
export function currentThemePreset(): string {
  return getThemePreset()
}

/** 应用自定义 CSS（空串即清除注入） */
export function applyCustomCss(css: string): void {
  let style = document.getElementById('custom-css-style') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'custom-css-style'
    document.head.appendChild(style)
  }
  style.textContent = css
}

/** 启动时恢复：预设 + 自定义 CSS */
export function restoreThemeStyles(): void {
  applyThemePreset(getThemePreset())
  applyCustomCss(getCustomCss())
}

/** 保存主题预设（持久化 + 即时应用） */
export function changeThemePreset(id: string): void {
  setThemePreset(id)
  applyThemePreset(id)
}

/** 保存自定义 CSS（持久化 + 即时应用） */
export function changeCustomCss(css: string): void {
  setCustomCss(css)
  applyCustomCss(css)
}
