/**
 * 导出：HTML（独立文件，mermaid/katex 走 CDN，样式内联）与 PDF（系统打印）
 *
 * @author chiangyang
 */
import MarkdownIt from 'markdown-it'
import { native } from './native'
import { slugify } from './toc'

const mdIt = new MarkdownIt({ html: false, linkify: true })

const EXPORT_CSS = `
  body { max-width: 860px; margin: 0 auto; padding: 48px 32px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    color: #24292f; line-height: 1.75; }
  h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; }
  blockquote { margin: 0; padding: 4px 16px; border-left: 4px solid #4a7cd4; color: #6a737d; }
  code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em;
    background: #f3f4f6; border-radius: 4px; padding: 2px 5px; }
  pre { background: #f6f8fa; border: 1px solid #e2e6ea; border-radius: 8px; padding: 12px 16px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e6ea; padding: 6px 12px; text-align: left; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  .mermaid { display: flex; justify-content: center; }
`

/**
 * 渲染 markdown 为 HTML：
 * - ```mermaid 代码块 → <pre class="mermaid">，由导出页里的 mermaid CDN 脚本渲染
 * - TOC 注释标记行删除（保留中间真实链接列表，正常渲染为可点目录）
 * - 标题加 GitHub 风格 id 锚点（与编辑器内 TOC 链接的 slug 规则一致）
 */
function renderMarkdown(markdown: string): string {
  const fence = mdIt.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
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
    const inline = tokens[idx + 1]
    const text = inline && inline.type === 'inline' ? inline.content : ''
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

export async function exportHtml(markdown: string, currentName: string) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${currentName.replace(/\.md$/i, '')}</title>
<style>${EXPORT_CSS}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] });"></script>
</head>
<body>
${renderMarkdown(markdown)}
</body>
</html>`

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

export async function exportPdf() {
  if (native) {
    await native.print()
  } else {
    window.print()
  }
}
