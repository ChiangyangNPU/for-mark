import { describe, it, expect } from 'vitest'
import { buildThemeVarsBlock, buildExportHtml } from '../export'

const LIGHT_VARS = {
  '--bg': '#ffffff',
  '--fg': '#24292f',
  '--muted': '#6a737d',
  '--border': '#e2e6ea',
  '--accent': '#4a7cd4',
  '--code-bg': '#f3f4f6',
  '--pre-bg': '#f6f8fa',
  '--quote-bg': 'transparent',
}

const DARK_VARS = {
  ...LIGHT_VARS,
  '--bg': '#1e2127',
  '--fg': '#d7dae0',
}

describe('buildThemeVarsBlock', () => {
  it('按固定顺序输出全部非空变量', () => {
    const block = buildThemeVarsBlock(LIGHT_VARS)
    const names = block
      .split('\n')
      .slice(1, -1)
      .map((line) => line.trim().split(':')[0])
    expect(names).toEqual([
      '--bg',
      '--fg',
      '--muted',
      '--border',
      '--accent',
      '--code-bg',
      '--pre-bg',
      '--quote-bg',
    ])
  })

  it('缺失的变量跳过而非输出空值', () => {
    expect(buildThemeVarsBlock({ '--bg': '#fff' })).toBe(':root {\n  --bg: #fff;\n}')
    expect(buildThemeVarsBlock({})).toBe(':root {\n\n}')
  })
})

describe('buildExportHtml', () => {
  const md = '# 标题\n\n正文'
  const base = (isDark: boolean, vars = LIGHT_VARS) => buildExportHtml(md, '笔记.md', vars, isDark)

  it('标题去掉 .md 后缀，正文渲染 markdown', () => {
    const html = base(false)
    expect(html).toContain('<title>笔记</title>')
    expect(html).toContain('<h1 id="标题">标题</h1>')
  })

  it('主题变量快照注入 :root，导出 CSS 以 var() 消费并带浅色兜底', () => {
    const html = base(false)
    expect(html).toContain(':root {\n  --bg: #ffffff;')
    expect(html).toContain('color: var(--fg, #24292f)')
    expect(html).not.toMatch(/color: #24292f;/) // 不再写死颜色
  })

  it('深色变量覆盖同名变量（快照在先，模板 var() 生效）', () => {
    const html = base(false, DARK_VARS)
    expect(html).toContain('--bg: #1e2127;')
  })

  it('mermaid 主题随深浅模式切换', () => {
    expect(base(false)).toContain("theme: 'default'")
    expect(base(true, DARK_VARS)).toContain("theme: 'dark'")
  })

  it('mermaid/katex 走 CDN 且保持 strict 安全级别', () => {
    const html = base(false)
    expect(html).toContain('mermaid@11/dist/mermaid.min.js')
    expect(html).toContain("securityLevel: 'strict'")
    expect(html).toContain('katex@0.16.11/dist/katex.min.js')
  })
})
