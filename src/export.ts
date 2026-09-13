/**
 * 导出：HTML（独立文件，mermaid/katex 走 CDN，样式内联）与 PDF（系统打印）
 *
 * @author chiangyang
 */
import MarkdownIt from 'markdown-it'
import { native } from './native'
import { slugify } from './toc'

const mdIt = new MarkdownIt({ html: false, linkify: true })

/**
 * 导出页消费的主题变量名（与 style.css 内建配色同名）。
 * 值由 collectThemeVars 在导出瞬间抓取，经 :root 注入后此处以 var() 消费——
 * 深浅模式、主题预设、自定义 CSS 改过的变量自动跟随；
 * fallback 为默认浅色值，快照缺失时行为与旧版写死浅色一致。
 */
const THEME_VAR_NAMES = [
  '--bg',
  '--fg',
  '--muted',
  '--border',
  '--accent',
  '--code-bg',
  '--pre-bg',
  '--quote-bg',
] as const

/** 变量名到导出页值的映射（纯函数，便于单测） */
export function buildThemeVarsBlock(vars: Record<string, string>): string {
  const lines = THEME_VAR_NAMES.filter((name) => vars[name]).map(
    (name) => `  ${name}: ${vars[name]};`,
  )
  return `:root {\n${lines.join('\n')}\n}`
}

/** 导出 CSS：颜色全部走 var()，兜底默认浅色 */
const EXPORT_CSS = `
  body { max-width: 860px; margin: 0 auto; padding: 48px 32px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    color: var(--fg, #24292f); background: var(--bg, #ffffff); line-height: 1.75; }
  a { color: var(--accent, #4a7cd4); }
  h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; }
  blockquote { margin: 0; padding: 4px 16px; border-left: 4px solid var(--accent, #4a7cd4);
    color: var(--muted, #6a737d); background: var(--quote-bg, transparent); }
  code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em;
    background: var(--code-bg, #f3f4f6); border-radius: 4px; padding: 2px 5px; }
  pre { background: var(--pre-bg, #f6f8fa); border: 1px solid var(--border, #e2e6ea);
    border-radius: 8px; padding: 12px 16px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--border, #e2e6ea); padding: 6px 12px; text-align: left; }
  th { background: var(--pre-bg, #f6f8fa); }
  img { max-width: 100%; }
  .mermaid { display: flex; justify-content: center; }
`

/**
 * 抓取当前已解析的主题变量快照（导出瞬间从 documentElement 计算）：
 * 深浅模式、预设、自定义 CSS 的变量覆盖都会体现在计算值里
 */
function collectThemeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const vars: Record<string, string> = {}
  for (const name of THEME_VAR_NAMES) {
    const v = cs.getPropertyValue(name).trim()
    if (v) vars[name] = v
  }
  return vars
}

/**
 * 渲染 markdown 为 HTML：
 * - ```mermaid 代码块 → <pre class="mermaid">，由导出页里的 mermaid CDN 脚本渲染
 * - TOC 注释标记行删除（保留中间真实链接列表，正常渲染为可点目录）
 * - 标题加 GitHub 风格 id 锚点（与编辑器内 TOC 链接的 slug 规则一致）
 */

/** inline token 的渲染纯文本（image 的 alt 不计入，与 ProseMirror textContent 对齐） */
type InlineToken = { type: string; content?: string; children?: InlineToken[] }
function inlineText(token: InlineToken): string {
  if (token.type === 'text' || token.type === 'code_inline') return token.content ?? ''
  if (token.type === 'image') return ''
  return (token.children ?? []).map(inlineText).join('')
}

function renderMarkdown(markdown: string): string {
  const fence =
    mdIt.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  mdIt.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'mermaid') {
      return `<pre class="mermaid">${mdIt.utils.escapeHtml(token.content)}</pre>\n`
    }
    return fence(tokens, idx, options, env, self)
  }

  // 同名标题计数：第一个为 slug，其后为 slug-1、slug-2（与 toc.ts collectHeadings 一致）
  const slugCount = new Map<string, number>()
  mdIt.renderer.rules.heading_open = (tokens, idx) => {
    const token = tokens[idx]
    const inline = tokens[idx + 1] as InlineToken | undefined
    const text = inline && inline.type === 'inline' ? inlineText(inline) : ''
    let slug = slugify(text)
    const seen = slugCount.get(slug) ?? 0
    slugCount.set(slug, seen + 1)
    if (seen > 0) slug = `${slug}-${seen}`
    return `<${token.tag} id="${mdIt.utils.escapeHtml(slug)}">`
  }

  // html:false 时注释会被转义成可见文本，直接移除 TOC 标记行（列表保留）；
  // 兼容行首可能存在的转义反斜杠（remark-stringify 防 HTML 转义产物）
  const cleaned = markdown.replace(/^[ \t]*\\?<!--\s*\/?TOC\s*-->[ \t]*$/gm, '')
  return mdIt.render(cleaned)
}

/**
 * 组装导出页 HTML（纯函数，便于单测）：
 * - vars：collectThemeVars 的主题变量快照，经 buildThemeVarsBlock 注入 :root
 * - isDark：mermaid 图表切 dark 主题（与当前深浅模式一致）
 */
export function buildExportHtml(
  markdown: string,
  currentName: string,
  vars: Record<string, string>,
  isDark: boolean,
): string {
  const mermaidTheme = isDark ? 'dark' : 'default'
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${currentName.replace(/\.md$/i, '')}</title>
<style>${buildThemeVarsBlock(vars)}</style>
<style>${EXPORT_CSS}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict', theme: '${mermaidTheme}' });</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });"></script>
</head>
<body>
${renderMarkdown(markdown)}
</body>
</html>`
}

/** 导出 HTML：按当前主题渲染为内嵌样式、引 Mermaid/KaTeX CDN 的独立页面（Electron 存盘 / 浏览器下载） */
export async function exportHtml(markdown: string, currentName: string) {
  const html = buildExportHtml(
    markdown,
    currentName,
    collectThemeVars(),
    document.documentElement.classList.contains('dark'),
  )

  const defaultName = currentName.replace(/\.(md|markdown)$/i, '') + '.html'
  if (native) {
    await native.exportAs({
      content: html,
      defaultName,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }
}

/** 导出 PDF：经打印对话框完成（Electron 走主进程打印，浏览器走 window.print） */
export async function exportPdf() {
  if (native) {
    await native.print()
  } else {
    window.print()
  }
}
