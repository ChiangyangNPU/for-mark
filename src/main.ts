import '@milkdown/kit/prose/view/style/prosemirror.css'
import './style.css'

import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { getMarkdown } from '@milkdown/kit/utils'
import { prism } from '@milkdown/plugin-prism'
import { mermaidPlugins, setMermaidTheme } from './mermaid'
import { pasteImage } from './paste-image'

// ---------------------------------------------------------------------------
// Electron 原生文件 API（preload 注入；浏览器环境下不存在，走降级方案）
// ---------------------------------------------------------------------------

interface NativeFileAPI {
  isNative: true
  openFile(): Promise<{ path: string; name: string; content: string } | null>
  saveFile(filePath: string, content: string): Promise<boolean>
  saveFileAs(content: string): Promise<{ path: string; name: string } | null>
  onMenu(callback: (action: 'open' | 'save' | 'save-as') => void): void
}

declare global {
  interface Window {
    forMarkAPI?: NativeFileAPI
  }
}

const native = window.forMarkAPI

// ---------------------------------------------------------------------------
// 应用状态与持久化
// ---------------------------------------------------------------------------

const DOC_KEY = 'for-mark:doc:v1'
const THEME_KEY = 'for-mark:theme'

const DEMO_DOC = `# for-mark 编辑器

所见即所得的 **Markdown** 编辑器，支持 \`mermaid\` 图表 *实时渲染*。

## 基础语法

- 无序列表项
1. 有序列表项
- [ ] 任务列表
- [x] 已完成的任务

> 引用块：像 Typora 一样写作。

| 功能 | 状态 |
| --- | --- |
| Mermaid 实时渲染 | ✅ |
| 深色模式 | ✅ |

## 流程图

\`\`\`mermaid
flowchart LR
    A[输入 Markdown] --> B{包含 mermaid 块?}
    B -- 是 --> C[实时渲染 SVG]
    B -- 否 --> D[正常排版]
    C --> E[点击图表编辑源码]
\`\`\`

## 时序图

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant E as 编辑器
    participant M as Mermaid
    U->>E: 输入 mermaid 代码
    E->>M: 防抖后渲染
    M-->>E: 返回 SVG
    E-->>U: 展示图表
\`\`\`

\`\`\`ts
// 代码块支持语法高亮
const app: string = 'for-mark'
\`\`\`
`

let editor: Editor | null = null
let currentFile: { path?: string; name: string } = { name: '未命名.md' }
let dirty = false

function loadDoc(): string {
  return localStorage.getItem(DOC_KEY) ?? DEMO_DOC
}

let saveTimer: number | undefined
function saveDoc(markdown: string) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => localStorage.setItem(DOC_KEY, markdown), 500)
}

function updateWordCount(markdown: string) {
  const el = document.getElementById('word-count')
  if (el) el.textContent = `${markdown.replace(/\s/g, '').length} 字`
}

function setDirty(value: boolean) {
  dirty = value
  document.title = `${dirty ? '• ' : ''}${currentFile.name} · for-mark`
}

// ---------------------------------------------------------------------------
// 编辑器
// ---------------------------------------------------------------------------

async function createEditor(markdown: string): Promise<Editor> {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.getElementById('editor'))
      ctx.set(defaultValueCtx, markdown)
      ctx.get(listenerCtx).markdownUpdated((_ctx, md, _prev) => {
        saveDoc(md)
        updateWordCount(md)
        setDirty(true)
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(mermaidPlugins)
    .use(prism)
    .use(pasteImage)
    .create()
}

/** 用新文档整体替换编辑器内容（打开文件 / 导入时） */
async function replaceDoc(markdown: string, file: { path?: string; name: string }) {
  editor?.destroy()
  editor = await createEditor(markdown)
  currentFile = file
  updateWordCount(markdown)
  setDirty(false)
}

function currentMarkdown(): string {
  return editor?.action(getMarkdown()) ?? ''
}

// ---------------------------------------------------------------------------
// 文件：打开 / 保存（Electron 原生 + 浏览器降级）
// ---------------------------------------------------------------------------

async function openDocument() {
  if (native) {
    const result = await native.openFile()
    if (result) await replaceDoc(result.content, { path: result.path, name: result.name })
    return
  }
  // 浏览器降级：<input type="file">
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,text/markdown'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    file.text().then((content) => replaceDoc(content, { name: file.name }))
  }
  input.click()
}

async function saveDocument(saveAs = false) {
  const markdown = currentMarkdown()
  if (native) {
    if (currentFile.path && !saveAs) {
      await native.saveFile(currentFile.path, markdown)
      setDirty(false)
    } else {
      const result = await native.saveFileAs(markdown)
      if (result) {
        currentFile = { path: result.path, name: result.name }
        setDirty(false)
      }
    }
    return
  }
  // 浏览器降级：下载 .md 文件
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = currentFile.name
  a.click()
  URL.revokeObjectURL(url)
  setDirty(false)
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function boot() {
  try {
    const dark = localStorage.getItem(THEME_KEY) === 'dark'
    document.body.classList.toggle('dark', dark)
    setMermaidTheme(dark ? 'dark' : 'default')

    editor = await createEditor(loadDoc())
    updateWordCount(loadDoc())
    setDirty(false)

    document.getElementById('import-btn')?.addEventListener('click', () => void openDocument())
    document.getElementById('export-btn')?.addEventListener('click', () => void saveDocument())
    native?.onMenu((action) => {
      if (action === 'open') void openDocument()
      if (action === 'save') void saveDocument()
      if (action === 'save-as') void saveDocument(true)
    })

    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
      const isDark = document.body.classList.toggle('dark')
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
      const button = document.getElementById('theme-toggle')
      if (button) button.textContent = isDark ? '☀️' : '🌙'

      // mermaid 主题在渲染时固化在 SVG 里，切换主题需要重渲染所有图表块；
      // v0.1 的简化实现：重建编辑器
      setMermaidTheme(isDark ? 'dark' : 'default')
      const markdown = currentMarkdown()
      await editor?.destroy()
      editor = await createEditor(markdown)
    })
  } catch (err) {
    // 启动失败时把错误显示出来，方便开发期排查
    const tip = document.createElement('pre')
    tip.style.cssText = 'color:#d1242f;padding:16px;white-space:pre-wrap'
    tip.textContent = '编辑器启动失败：\n' + (err instanceof Error ? err.stack : String(err))
    document.body.appendChild(tip)
    throw err
  }
}

void boot()
