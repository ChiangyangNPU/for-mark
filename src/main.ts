import '@milkdown/kit/prose/view/style/prosemirror.css'
import 'katex/dist/katex.min.css'
import './style.css'

import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { getMarkdown } from '@milkdown/kit/utils'
import { prism } from '@milkdown/plugin-prism'
import { math } from '@milkdown/plugin-math'
import type { EditorView } from '@milkdown/kit/prose/view'
import { mermaidPlugins, setMermaidTheme } from './mermaid'
import { pasteImage } from './paste-image'
import { findPlugin, findSetQuery, findStep, findReplaceCurrent, findReplaceAll, findClear, findState } from './find'
import { collectOutline, renderOutline } from './outline'
import { exportHtml, exportPdf } from './export'
import { createSourceEditor } from './sourcemode'
import { renderFileTree, renderRecent, type FileEntry } from './filetree'
import { native } from './native'
import { t, applyDomTexts, menuLabels } from './i18n'

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const DOC_KEY = 'for-mark:doc:v1'
const THEME_KEY = 'for-mark:theme'
const RECENT_KEY = 'for-mark:recent'

interface DocTab {
  id: string
  path?: string
  name: string
  markdown: string
  dirty: boolean
}

const DEMO_DOC = `# for-mark 编辑器

所见即所得的 **Markdown** 编辑器，支持 \`mermaid\` 图表 *实时渲染*。

## 流程图

\`\`\`mermaid
flowchart LR
    A[输入 Markdown] --> B{包含 mermaid 块?}
    B -- 是 --> C[实时渲染 SVG]
    B -- 否 --> D[正常排版]
\`\`\`

\`\`\`ts
// 代码块支持语法高亮
const app: string = 'for-mark'
\`\`\`

公式：$E = mc^2$

| 功能 | 状态 |
| --- | --- |
| Mermaid 实时渲染 | ✅ |
| 深色模式 | ✅ |
`

const tabs: DocTab[] = []
let activeTabId: string | null = null
let editor: Editor | null = null
let pmView: EditorView | null = null
let sourceMode = false
let cmView: { destroy(): void; state: { doc: { toString(): string } } } | null = null
let autosaveEnabled = false
let folderTree: { path: string; name: string; children: FileEntry[] } | null = null

let autosaveTimer: number | undefined

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

function loadDoc(): string {
  return localStorage.getItem(DOC_KEY) ?? DEMO_DOC
}

function saveDoc(markdown: string) {
  localStorage.setItem(DOC_KEY, markdown)
}

function updateWordCount(markdown: string) {
  const el = document.getElementById('word-count')
  if (el) el.textContent = t('editor.wordCount', { count: markdown.replace(/\s/g, '').length })
}

function updateTitle() {
  const tab = activeTab()
  const text = `${tab?.dirty ? '• ' : ''}${tab?.name ?? t('tab.untitled')}`
  document.title = text
  const el = document.getElementById('win-title')
  if (el) el.textContent = text
}

/** 把任一标签页的未保存状态同步给 Electron 主进程（关闭确认用） */
function notifyDirty() {
  native?.setDirty(tabs.some((t) => t.dirty))
}

function activeTab(): DocTab | undefined {
  return tabs.find((t) => t.id === activeTabId)
}

function recentList(): { name: string; path: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

function pushRecent(path: string, name: string) {
  const list = recentList().filter((r) => r.path !== path)
  list.unshift({ path, name })
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
  renderFilesSidebar()
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
        const tab = activeTab()
        if (tab && !tab.dirty) {
          tab.dirty = true
          renderTabs()
          updateTitle()
        }
      })
      ctx.get(listenerCtx).updated((_ctx, doc) => {
        // 文档结构变化时刷新大纲
        const list = document.getElementById('outline-list')
        if (list && pmView) renderOutline(list, collectOutline(doc), pmView)
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(mermaidPlugins)
    .use(prism)
    .use(math)
    .use(pasteImage)
    .use(findPlugin)
    .create()
}

async function replaceEditor(markdown: string) {
  findClear(pmView)
  editor?.destroy()
  editor = await createEditor(markdown)
  editor.action((ctx) => {
    pmView = ctx.get(editorViewCtx)
  })
  updateWordCount(markdown)
  const list = document.getElementById('outline-list')
  if (list && pmView) renderOutline(list, collectOutline(pmView.state.doc), pmView)
  setSourceMode(false, false)
}

function currentMarkdown(): string {
  if (sourceMode && cmView) return cmView.state.doc.toString()
  return editor?.action(getMarkdown()) ?? ''
}

// ---------------------------------------------------------------------------
// 标签页
// ---------------------------------------------------------------------------

let tabSeq = 0

function newTab(name: string, markdown: string, path?: string): DocTab {
  const tab: DocTab = { id: `tab-${++tabSeq}`, name, markdown, dirty: false, path }
  tabs.push(tab)
  return tab
}

function renderTabs() {
  notifyDirty()
  const bar = document.getElementById('tab-bar')
  if (!bar) return
  bar.textContent = ''
  for (const tab of tabs) {
    const el = document.createElement('div')
    el.className = `tab${tab.id === activeTabId ? ' active' : ''}`
    const label = document.createElement('span')
    label.textContent = `${tab.dirty ? '• ' : ''}${tab.name}`
    const close = document.createElement('button')
    close.className = 'tab-close'
    close.textContent = '✕'
    close.title = '关闭标签页'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      void closeTab(tab.id)
    })
    el.append(label, close)
    el.addEventListener('click', () => void activateTab(tab.id))
    bar.appendChild(el)
  }
}

async function activateTab(id: string) {
  if (id === activeTabId) return
  const current = activeTab()
  if (current) current.markdown = currentMarkdown()

  const target = tabs.find((t) => t.id === id)
  if (!target) return
  activeTabId = id
  renderTabs()
  updateTitle()
  await replaceEditor(target.markdown)
}

async function closeTab(id: string) {
  const tab = tabs.find((t) => t.id === id)
  if (!tab) return
  const liveDirty = tab.id === activeTabId ? currentMarkdown() !== tab.markdown : tab.dirty
  if (liveDirty && !window.confirm(t('dialog.closeConfirm', { name: tab.name }))) return

  const index = tabs.indexOf(tab)
  tabs.splice(index, 1)
  if (activeTabId === id) {
    activeTabId = null
    const next = tabs[Math.min(index, tabs.length - 1)]
    if (next) {
      await activateTab(next.id)
    } else if (native) {
      // 最后一个标签页已关闭：直接关窗口（Mac 惯例，应用留在后台）
      editor?.destroy()
      editor = null
      pmView = null
      window.close()
      return
    } else {
      // 浏览器模式：window.close 无效，退回新建空白页
      editor?.destroy()
      editor = null
      pmView = null
      newTab(t('tab.untitled'), '')
      await activateTab(tabs[0].id)
    }
  }
  renderTabs()
  updateTitle()
}

function isContentDirty(): boolean {
  const tab = activeTab()
  return !!tab && currentMarkdown() !== tab.markdown
}
void isContentDirty

// ---------------------------------------------------------------------------
// 文件操作
// ---------------------------------------------------------------------------

async function openDocument() {
  if (native) {
    const result = await native.openFile()
    if (result) await openFromData(result)
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,text/markdown'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    file.text().then((content) => openFromData({ name: file.name, content }))
  }
  input.click()
}

async function openFromData(data: { path?: string; name: string; content: string }) {
  // 已打开同一文件 → 跳到那个标签页
  if (data.path) {
    const existing = tabs.find((t) => t.path === data.path)
    if (existing) {
      await activateTab(existing.id)
      return
    }
    pushRecent(data.path, data.name)
  }
  // 唯一的"未命名"空白标签页 → 原地替换，避免启动时残留空标签
  if (tabs.length === 1) {
    const only = tabs[0]
    if (!only.path && only.name === t('tab.untitled') && !only.dirty && currentMarkdown() === only.markdown) {
      only.path = data.path
      only.name = data.name
      only.markdown = data.content
      await replaceEditor(data.content)
      renderTabs()
      updateTitle()
      return
    }
  }
  const tab = newTab(data.name, data.content, data.path)
  await activateTab(tab.id)
}

async function saveDocument(saveAs = false) {
  const tab = activeTab()
  if (!tab) return
  const markdown = currentMarkdown()
  tab.markdown = markdown

  if (native) {
    if (tab.path && !saveAs) {
      await native.saveFile(tab.path, markdown)
    } else {
      const result = await native.saveFileAs(markdown)
      if (!result) return
      tab.path = result.path
      tab.name = result.name
      pushRecent(result.path, result.name)
    }
  } else {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = tab.name
    a.click()
    URL.revokeObjectURL(url)
  }
  tab.dirty = false
  renderTabs()
  updateTitle()
}

async function openFolder() {
  if (!native) return
  const dir = await native.openFolder()
  if (!dir) return
  const tree = await native.readDir(dir)
  if (!tree) return
  folderTree = tree
  const title = document.getElementById('folder-title')
  if (title) title.textContent = `文件夹：${tree.name}`
  renderFilesSidebar()
}

async function openPath(path: string) {
  if (!native) return
  const result = await native.readFile(path)
  await openFromData(result)
}

function renderFilesSidebar() {
  const recentEl = document.getElementById('recent-list')
  if (recentEl) renderRecent(recentEl, recentList(), (p) => void openPath(p))
  const treeEl = document.getElementById('folder-tree')
  if (treeEl) {
    treeEl.textContent = ''
    if (folderTree) renderFileTree(treeEl, folderTree.children, (p) => void openPath(p))
  }
}

// ---------------------------------------------------------------------------
// 源码模式
// ---------------------------------------------------------------------------

async function setSourceMode(on: boolean, syncContent = true) {
  const pmEl = document.getElementById('editor')
  const srcEl = document.getElementById('src-editor')
  const btn = document.getElementById('source-mode-btn')
  if (!pmEl || !srcEl) return

  if (on) {
    const markdown = currentMarkdown()
    cmView?.destroy()
    srcEl.textContent = ''
    cmView = createSourceEditor(srcEl, markdown)
  } else if (sourceMode && cmView) {
    const markdown = cmView.state.doc.toString()
    cmView.destroy()
    cmView = null
    if (syncContent) await replaceEditor(markdown)
  }

  sourceMode = on
  pmEl.hidden = on
  srcEl.hidden = !on
  if (btn) btn.textContent = on ? t('toolbar.sourceModeOn') : t('toolbar.sourceMode')
}

// ---------------------------------------------------------------------------
// 查找替换（仅所见即所得模式）
// ---------------------------------------------------------------------------

function openFindBar() {
  const bar = document.getElementById('find-bar')
  if (!bar) return
  if (sourceMode) return // 源码模式使用 CodeMirror 自带搜索
  bar.hidden = false
  ;(document.getElementById('find-input') as HTMLInputElement | null)?.focus()
}

function closeFindBar() {
  const bar = document.getElementById('find-bar')
  if (bar) bar.hidden = true
  findClear(sourceMode ? null : pmView)
}

function wireFindBar() {
  const findInput = document.getElementById('find-input') as HTMLInputElement | null
  const replaceInput = document.getElementById('replace-input') as HTMLInputElement | null
  const countEl = document.getElementById('find-count')

  function refreshCount() {
    const s = findState()
    if (countEl) countEl.textContent = `${s.matches.length ? s.index + 1 : 0}/${s.matches.length}`
  }

  findInput?.addEventListener('input', () => {
    if (!pmView || sourceMode) return
    findSetQuery(pmView, findInput.value)
    refreshCount()
  })
  findInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && pmView) {
      e.preventDefault()
      findStep(pmView, e.shiftKey ? -1 : 1)
      refreshCount()
    }
    if (e.key === 'Escape') closeFindBar()
  })
  document.getElementById('find-next')?.addEventListener('click', () => {
    if (pmView) {
      findStep(pmView, 1)
      refreshCount()
    }
  })
  document.getElementById('find-prev')?.addEventListener('click', () => {
    if (pmView) {
      findStep(pmView, -1)
      refreshCount()
    }
  })
  document.getElementById('replace-one')?.addEventListener('click', () => {
    if (pmView && replaceInput) {
      findReplaceCurrent(pmView, replaceInput.value)
      refreshCount()
    }
  })
  document.getElementById('replace-all')?.addEventListener('click', () => {
    if (pmView && replaceInput) {
      findReplaceAll(pmView, replaceInput.value)
      refreshCount()
    }
  })
  document.getElementById('find-close')?.addEventListener('click', closeFindBar)
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function boot() {
  try {
    applyDomTexts()
    // Mac 隐藏标题栏：工具栏让出红绿灯按钮的空间
    if (navigator.userAgent.includes('Macintosh')) {
      document.documentElement.classList.add('mac')
    }
    // 菜单栏文案跟随当前语言（Electron 主进程据此重建菜单）
    native?.setLocaleInfo(menuLabels())
    const dark = localStorage.getItem(THEME_KEY) === 'dark'
    document.body.classList.toggle('dark', dark)
    setMermaidTheme(dark ? 'dark' : 'default')

    const tab = newTab(t('tab.untitled'), loadDoc())
    activeTabId = tab.id
    editor = await createEditor(tab.markdown)
    editor.action((ctx) => {
      pmView = ctx.get(editorViewCtx)
    })
    updateWordCount(tab.markdown)
    updateTitle()
    renderTabs()
    // 首屏大纲（listener.updated 只在文档变化时触发）
    const outlineList = document.getElementById('outline-list')
    if (outlineList && pmView) renderOutline(outlineList, collectOutline(pmView.state.doc), pmView)

    // 工具栏
    document.getElementById('import-btn')?.addEventListener('click', () => void openDocument())
    document.getElementById('export-btn')?.addEventListener('click', () => void saveDocument())
    document.getElementById('source-mode-btn')?.addEventListener('click', () => void setSourceMode(!sourceMode))
    document.getElementById('sidebar-outline-btn')?.addEventListener('click', () => toggleSidebar('outline'))

    // ⋯ 溢出菜单
    document.getElementById('menu-files-btn')?.addEventListener('click', () => {
      toggleSidebar('files')
      closeMoreMenu()
    })
    document.getElementById('menu-find-btn')?.addEventListener('click', () => {
      openFindBar()
      closeMoreMenu()
    })
    document.getElementById('menu-export-html-btn')?.addEventListener('click', () => {
      void exportHtml(currentMarkdown(), activeTab()?.name ?? t('tab.untitled'))
      closeMoreMenu()
    })
    document.getElementById('menu-settings-btn')?.addEventListener('click', () => {
      closeMoreMenu()
      showToast('设置功能开发中，敬请期待')
    })
    document.getElementById('more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const menu = document.getElementById('more-menu')
      if (menu) menu.hidden = !menu.hidden
    })
    // 点击菜单外任意位置收起
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('more-menu')
      if (!menu || menu.hidden) return
      const target = e.target as HTMLElement
      if (!target.closest('#more-menu') && !target.closest('#more-btn')) {
        menu.hidden = true
      }
    })

    document.getElementById('open-folder-btn')?.addEventListener('click', () => void openFolder())

    document.getElementById('theme-toggle')?.addEventListener('click', async () => {
      const isDark = document.body.classList.toggle('dark')
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
      const button = document.getElementById('theme-toggle')
      if (button) button.textContent = isDark ? '☀️' : '🌙'
      setMermaidTheme(isDark ? 'dark' : 'default')
      await replaceEditor(currentMarkdown())
    })

    // 快捷键（源码模式下 F 键交给 CodeMirror）
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMoreMenu()
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'f' && !sourceMode) {
        e.preventDefault()
        openFindBar()
      } else if (e.key === 'e') {
        e.preventDefault()
        void setSourceMode(!sourceMode)
      } else if (e.key === 't') {
        e.preventDefault()
        const created = newTab(t('tab.untitled'), '')
        void activateTab(created.id)
      } else if (e.key === 'w') {
        e.preventDefault()
        if (activeTabId) void closeTab(activeTabId)
      }
    })

    // 菜单（Electron）
    native?.onMenu((action) => {
      const handlers: Record<string, () => void> = {
        open: () => void openDocument(),
        'open-folder': () => void openFolder(),
        save: () => void saveDocument(),
        'save-as': () => void saveDocument(true),
        'new-tab': () => {
          const created = newTab(t('tab.untitled'), '')
          void activateTab(created.id)
        },
        'close-tab': () => {
          if (activeTabId) void closeTab(activeTabId)
        },
        'export-html': () => void exportHtml(currentMarkdown(), activeTab()?.name ?? t('tab.untitled')),
        'export-pdf': () => void exportPdf(),
      }
      handlers[action]?.()
    })
    native?.onAutosave((enabled) => {
      autosaveEnabled = enabled
      if (enabled) scheduleAutosave()
    })
    // 文件关联：Finder 双击 / 系统打开方式
    native?.onOpenPath((path) => void openPath(path))

    // 自动保存：开启后每 5 秒把脏标签页写回文件
    function scheduleAutosave() {
      window.clearInterval(autosaveTimer)
      if (!autosaveEnabled) return
      autosaveTimer = window.setInterval(() => {
        const t = activeTab()
        if (t?.path && t.dirty && !sourceMode) void saveDocument()
      }, 5000)
    }

    // 未保存关闭确认已移到 Electron 主进程（close 事件 + 原生对话框），
    // 渲染层的 beforeunload/confirm 在 Electron 关闭流程中不可靠

    wireFindBar()
    renderFilesSidebar()
    // 就绪信号：主进程补发排队中的待打开文件
    native?.ready()
  } catch (err) {
    const tip = document.createElement('pre')
    tip.style.cssText = 'color:#d1242f;padding:16px;white-space:pre-wrap'
    tip.textContent = t('boot.failed') + (err instanceof Error ? err.stack : String(err))
    document.body.appendChild(tip)
    throw err
  }
}

function closeMoreMenu() {
  const menu = document.getElementById('more-menu')
  if (menu) menu.hidden = true
}

function showToast(text: string) {
  document.getElementById('toast')?.remove()
  const el = document.createElement('div')
  el.id = 'toast'
  el.className = 'toast'
  el.textContent = text
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 2000)
}

function toggleSidebar(which: 'outline' | 'files') {  const sidebar = document.getElementById('sidebar')
  const outlinePanel = document.getElementById('outline-panel')
  const filesPanel = document.getElementById('files-panel')
  if (!sidebar || !outlinePanel || !filesPanel) return

  const showOutline = which === 'outline'
  const targetPanel = showOutline ? outlinePanel : filesPanel
  const otherPanel = showOutline ? filesPanel : outlinePanel
  otherPanel.hidden = true
  targetPanel.hidden = !targetPanel.hidden
  sidebar.hidden = targetPanel.hidden && otherPanel.hidden
}

void boot()
