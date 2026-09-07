/**
 * for-mark - 轻量跨平台 Markdown 所见即所得编辑器
 *
 * 应用启动入口：负责整体状态编排（标签页 / 脏标记 / 主题 / 语言），
 * 以及各功能模块（编辑器、文件、查找、大纲、源码模式、导出）的装配与联动。
 *
 * 渲染层不含任何 Node/Electron API——系统能力统一经 src/native.ts 的
 * 受控接口访问，保证同一份代码可同时运行在 Electron 与浏览器中。
 *
 * @author chiangyang
 */
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
import { t, applyDomTexts, menuLabels, getLocale, setLocale } from './i18n'
import { setImagePasteContext, type ImageStrategy } from './paste-image'
import { setImageBaseDir, imageSrcResolver } from './image-resolver'


// ---------------------------------------------------------------------------
// 本地存储键与应用常量
// ---------------------------------------------------------------------------

/** localStorage：自动保存的文档内容 */
const DOC_KEY = 'for-mark:doc:v1'
/** localStorage：主题偏好（dark / light） */
const THEME_KEY = 'for-mark:theme'
/** localStorage：最近打开文件列表 */
const RECENT_KEY = 'for-mark:recent'
/** localStorage：粘贴图片存储策略（inline / assets） */
const IMAGE_STRATEGY_KEY = 'for-mark:img'
/** localStorage：自动保存开关（桌面版主进程菜单勾选的镜像） */
const AUTOSAVE_KEY = 'for-mark:autosave'

/** 首次启动（无本地文档）时展示的初始内容（空文档，由用户自行输入） */
const DEMO_DOC = ''

// ---------------------------------------------------------------------------
// 应用状态
// ---------------------------------------------------------------------------

/** 打开的文档标签页：一个标签对应一份在编辑的文档 */
interface DocTab {
  id: string
  /** 关联的磁盘文件绝对路径；未保存过的新文档为 undefined */
  path?: string
  /** 标签页展示名（文件名） */
  name: string
  /** 打开/保存时的基准内容，用于判断是否有未保存修改 */
  markdown: string
  dirty: boolean
  /** 标记该标签是启动时从 localStorage 恢复的上次未保存内容（不可被"打开文件"原地替换） */
  recovered?: boolean
}

/** 全部打开的标签页（有序） */
const tabs: DocTab[] = []
/** 当前激活标签页 id；切换标签时其余标签的内容暂存回各自 DocTab */
let activeTabId: string | null = null
/** 当前激活标签页对应的 Milkdown 编辑器实例 */
let editor: Editor | null = null
/** 当前激活标签页的 ProseMirror 视图（供大纲/查找等模块直接操作文档） */
let pmView: EditorView | null = null
/** 是否处于源码模式（CodeMirror 整篇编辑） */
let sourceMode = false
/** 源码模式下的 CodeMirror 实例（仅源码模式期间存在） */
let cmView: { destroy(): void; state: { doc: { toString(): string } } } | null = null
/** 自动保存开关（启动从 localStorage 恢复；菜单/设置面板双向同步） */
let autosaveEnabled = localStorage.getItem(AUTOSAVE_KEY) === 'true'
/** 粘贴图片存储策略（设置面板配置） */
let imageStrategy: ImageStrategy = (localStorage.getItem(IMAGE_STRATEGY_KEY) as ImageStrategy) ?? 'inline'
/** 已打开的文件夹树（文件树侧边栏数据） */
let folderTree: { path: string; name: string; children: FileEntry[] } | null = null

/** 自动保存定时器句柄 */
let autosaveTimer: number | undefined

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/** 文档内容写入 localStorage（崩溃/误关兜底，与磁盘保存无关） */
function saveDoc(markdown: string) {
  localStorage.setItem(DOC_KEY, markdown)
}

/** 刷新工具栏字数统计（去空白字符后的长度） */
function updateWordCount(markdown: string) {
  const el = document.getElementById('word-count')
  if (el) el.textContent = t('editor.wordCount', { count: markdown.replace(/\s/g, '').length })
}

/** 同步窗口标题（居中文件名 + 未保存圆点标记）并更新图片显示目录 */
function updateTitle() {
  const tab = activeTab()
  const text = `${tab?.dirty ? '• ' : ''}${tab?.name ?? t('tab.untitled')}`
  document.title = text
  const el = document.getElementById('win-title')
  if (el) el.textContent = text
  // 相对路径图片的显示解析目录跟随当前文档位置
  setImageBaseDir(tab?.path ? dirName(tab.path) : null)
}

/** 取路径的目录部分（兼容 / 与 \ 分隔符） */
function dirName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : p
}

/** 获取当前激活的标签页数据 */
function activeTab(): DocTab | undefined {
  return tabs.find((t) => t.id === activeTabId)
}

/** 把任一标签页的未保存状态同步给 Electron 主进程（关闭确认用） */
function notifyDirty() {
  native?.setDirty(tabs.some((t) => t.dirty))
}

/** 读取最近打开文件列表（localStorage 持久化，最多 8 条） */
function recentList(): { name: string; path: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** 记录一条最近打开文件并刷新侧边栏 */
function pushRecent(path: string, name: string) {
  const list = recentList().filter((r) => r.path !== path)
  list.unshift({ path, name })
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
  renderFilesSidebar()
}

// ---------------------------------------------------------------------------
// 编辑器装配
// ---------------------------------------------------------------------------

/**
 * 创建 Milkdown 编辑器实例并挂载到 #editor。
 *
 * 插件清单：commonmark（基础语法）、gfm（表格/任务列表）、history（撤销重做）、
 * listener（内容监听）、mermaid（自研图表插件）、prism（代码高亮）、
 * math（KaTeX 公式）、pasteImage（粘贴图片）、findPlugin（查找高亮）。
 */
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
    .use(imageSrcResolver)
    .create()
}

/** 销毁当前编辑器并用新文档重建（打开文件 / 切换标签 / 主题切换共用） */
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

/** 取当前编辑器内容的 markdown 文本（源码模式下取 CodeMirror 内容） */
function currentMarkdown(): string {
  if (sourceMode && cmView) return cmView.state.doc.toString()
  return editor?.action(getMarkdown()) ?? ''
}

// ---------------------------------------------------------------------------
// 标签页
// ---------------------------------------------------------------------------

/** 标签页自增 id 计数 */
let tabSeq = 0

/** 创建一个标签页数据（不激活） */
function newTab(name: string, markdown: string, path?: string): DocTab {
  const tab: DocTab = { id: `tab-${++tabSeq}`, name, markdown, dirty: false, path }
  tabs.push(tab)
  return tab
}

/** 重绘标签栏（含未保存圆点、激活高亮、关闭按钮）并同步脏状态到主进程 */
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
    close.title = t('menu.closeTab')
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      void closeTab(tab.id)
    })
    el.append(label, close)
    el.addEventListener('click', () => void activateTab(tab.id))
    bar.appendChild(el)
  }
  // 标签后的「+」新建入口（点击标签栏空白区同样有效）
  const plus = document.createElement('button')
  plus.className = 'tab-new'
  plus.textContent = '+'
  plus.title = t('menu.newTab')
  plus.addEventListener('click', () => void createNewTab())
  bar.appendChild(plus)
}

/** 激活指定标签页：暂存当前标签内容 → 重建编辑器载入目标内容 */
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

/**
 * 生成下一个可用的未命名标签名：未命名.md → 未命名-1.md → 未命名-2.md。
 * 在已打开标签中查重；词干取自当前语言包（中文"未命名"/英文"Untitled"）。
 */
function nextUntitledName(): string {
  const base = t('tab.untitled')
  const stem = base.replace(/\.(md|markdown)$/i, '')
  const ext = base.slice(stem.length)
  const taken = new Set(tabs.map((tb) => tb.name))
  if (!taken.has(base)) return base
  let n = 1
  while (taken.has(`${stem}-${n}${ext}`)) n++
  return `${stem}-${n}${ext}`
}

/** 新建一个空白标签页并激活（工具栏「+」/ 空白区双击 / 快捷键 / 菜单共用） */
function createNewTab() {
  const created = newTab(nextUntitledName(), '')
  void activateTab(created.id)
}

/**
 * 关闭标签页。有未保存修改时弹确认；
 * 关闭最后一个标签时直接关闭窗口（Mac 惯例：应用留在后台）。
 */
async function closeTab(id: string) {
  const tab = tabs.find((t) => t.id === id)
  if (!tab) return
  // 脏标记由编辑事件维护（仅真实编辑会置位），不要用序列化内容反比——
  // markdown 序列化会规范化文本（尾随空格、列表标记等），未修改的文档也会被判为已修改
  if (tab.dirty && !window.confirm(t('dialog.closeConfirm', { name: tab.name }))) return

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
      newTab(nextUntitledName(), '')
      await activateTab(tabs[0].id)
    }
  }
  renderTabs()
  updateTitle()
}

// ---------------------------------------------------------------------------
// 文件操作（Electron 原生对话框 + 浏览器降级）
// ---------------------------------------------------------------------------

/**
 * 打开文档：
 * - Electron：原生文件选择对话框（自动去重已打开的同路径文件）
 * - 浏览器：降级为 <input type="file">
 */
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

/**
 * 用读取到的文件数据打开文档：
 * 同路径已打开 → 跳转既有标签；唯一的空白"未命名"标签 → 原地替换；否则新建标签。
 */
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
  // 替换对象：任意"空白新建标签"（无路径、无修改、内容为空、非恢复内容）；
  // 恢复出来的未保存内容带 recovered 标记，不会被打开的文件覆盖
  const blankIdx = tabs.findIndex((t) => !t.path && !t.recovered && !t.dirty && t.markdown === '')
  if (blankIdx !== -1) {
    const only = tabs[blankIdx]
    only.path = data.path
    only.name = data.name
    only.markdown = data.content
    await replaceEditor(data.content)
    renderTabs()
    updateTitle()
    return
  }
  const tab = newTab(data.name, data.content, data.path)
  await activateTab(tab.id)
}

/**
 * 保存当前标签页：
 * - 已关联磁盘文件 → 直接写回；未关联 → 弹"另存为"
 * - 浏览器降级为下载 .md 文件
 */
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
  // 已无未保存内容时清除恢复副本，避免下次启动"复活"已保存的旧文档
  if (!tabs.some((t) => t.dirty)) localStorage.removeItem(DOC_KEY)
  renderTabs()
  updateTitle()
}

/** 打开文件夹：读取目录树数据并渲染到文件树侧边栏（仅 Electron） */
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

/** 按绝对路径打开文件（文件树 / 最近列表点击时） */
async function openPath(path: string) {
  if (!native) return
  const result = await native.readFile(path)
  await openFromData(result)
}

/** 渲染文件树侧边栏（最近列表 + 文件夹树） */
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
// 源码模式（CodeMirror 6）
// ---------------------------------------------------------------------------

/**
 * 切换 所见即所得 / 源码 模式。
 * 进入时把 markdown 全文交给 CodeMirror；退出时取回全文重建编辑器。
 */
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
// 查找替换（仅所见即所得模式；源码模式用 CodeMirror 自带搜索）
// ---------------------------------------------------------------------------

/** 打开查找栏（源码模式下不打开，留给 CodeMirror 搜索） */
function openFindBar() {
  const bar = document.getElementById('find-bar')
  if (!bar) return
  if (sourceMode) return
  bar.hidden = false
  ;(document.getElementById('find-input') as HTMLInputElement | null)?.focus()
}

/** 关闭查找栏并清除高亮 */
function closeFindBar() {
  const bar = document.getElementById('find-bar')
  if (bar) bar.hidden = true
  findClear(sourceMode ? null : pmView)
}

/** 绑定查找栏的输入、上下跳转、替换单个/全部、关闭等交互 */
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
// 侧边栏
// ---------------------------------------------------------------------------

/** 关闭 ⋯ 溢出菜单 */
function closeMoreMenu() {
  const menu = document.getElementById('more-menu')
  if (menu) menu.hidden = true
}

/** 应用主题：CSS 变量切换 + mermaid 主题切换 + 重建编辑器重渲染图表 */
let themeApplying: Promise<void> = Promise.resolve()
function applyTheme(isDark: boolean): Promise<void> {
  // 串行化：快速连续切换时避免异步重建互相踩踏（产生多个编辑器实例）
  themeApplying = themeApplying
    .then(() => doApplyTheme(isDark))
    .catch((err) => console.error('[for-mark] 主题切换失败', err))
  return themeApplying
}

async function doApplyTheme(isDark: boolean) {
  document.body.classList.toggle('dark', isDark)
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  const button = document.getElementById('theme-toggle')
  if (button) button.textContent = isDark ? '☀️' : '🌙'
  setMermaidTheme(isDark ? 'dark' : 'default')
  // mermaid 主题固化在 SVG 里，重建编辑器重渲染所有图表
  const markdown = currentMarkdown()
  await replaceEditor(markdown)
}

// ---------------------------------------------------------------------------
// 设置面板
// ---------------------------------------------------------------------------

/** 打开设置面板并反映当前配置值 */
function openSettings() {
  const overlay = document.getElementById('settings-overlay')
  if (!overlay) return

  const langRadio = overlay.querySelector(`input[name="set-lang"][value="${getLocale()}"]`) as HTMLInputElement | null
  if (langRadio) langRadio.checked = true
  const isDark = document.body.classList.contains('dark')
  const themeRadio = overlay.querySelector(`input[name="set-theme"][value="${isDark ? 'dark' : 'light'}"]`) as HTMLInputElement | null
  if (themeRadio) themeRadio.checked = true
  const autosaveBox = document.getElementById('set-autosave') as HTMLInputElement | null
  if (autosaveBox) {
    autosaveBox.checked = autosaveEnabled && !!native
    autosaveBox.disabled = !native
  }
  const imgRadio = overlay.querySelector(`input[name="set-img"][value="${imageStrategy}"]`) as HTMLInputElement | null
  if (imgRadio) imgRadio.checked = true

  overlay.hidden = false
}

/** 关闭设置面板 */
function closeSettings() {
  document.getElementById('settings-overlay')?.setAttribute('hidden', '')
}

/** 切换侧边栏面板（大纲 / 文件二选一，互斥展开收起） */
function toggleSidebar(which: 'outline' | 'files') {
  const sidebar = document.getElementById('sidebar')
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

// ---------------------------------------------------------------------------
// 启动与全局装配
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

    const restored = localStorage.getItem(DOC_KEY)
    const tab = newTab(nextUntitledName(), restored ?? DEMO_DOC)
    if (restored != null) tab.recovered = true // 恢复副本：不可被"打开文件"原地替换
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
    // 双击标签栏空白区新建标签（单击保留给未来的其他交互）
    document.getElementById('tab-bar')?.addEventListener('dblclick', (e) => {
      if (e.target === e.currentTarget) createNewTab()
    })

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      void applyTheme(!document.body.classList.contains('dark'))
    })

    // 设置面板
    document.getElementById('menu-settings-btn')?.addEventListener('click', () => {
      closeMoreMenu()
      openSettings()
    })
    document.getElementById('settings-close')?.addEventListener('click', closeSettings)
    document.getElementById('settings-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSettings()
    })
    document.querySelectorAll('input[name="set-lang"]').forEach((input) => {
      input.addEventListener('change', () => {
        setLocale((input as HTMLInputElement).value)
        applyDomTexts()
        renderTabs()
        updateTitle()
        updateWordCount(currentMarkdown())
        native?.setLocaleInfo(menuLabels())
      })
    })
    document.querySelectorAll('input[name="set-theme"]').forEach((input) => {
      input.addEventListener('change', () => {
        void applyTheme((input as HTMLInputElement).value === 'dark')
      })
    })
    document.getElementById('set-autosave')?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked
      autosaveEnabled = enabled
      localStorage.setItem(AUTOSAVE_KEY, enabled ? 'true' : 'false')
      native?.setAutosaveEnabled(enabled)
      if (enabled) scheduleAutosave()
      else window.clearInterval(autosaveTimer)
    })
    document.querySelectorAll('input[name="set-img"]').forEach((input) => {
      input.addEventListener('change', () => {
        imageStrategy = (input as HTMLInputElement).value as ImageStrategy
        localStorage.setItem(IMAGE_STRATEGY_KEY, imageStrategy)
      })
    })

    // 粘贴图片上下文：策略来自设置，目录来自当前标签页路径
    setImagePasteContext({
      getStrategy: () => imageStrategy,
      getBaseDir: () => {
        const t = activeTab()
        return t?.path ? dirName(t.path) : null
      },
    })

    // 快捷键（源码模式下 F 键交给 CodeMirror）
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMoreMenu()
        closeSettings()
      }
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
        createNewTab()
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
        'new-tab': () => createNewTab(),
        'close-tab': () => {
          if (activeTabId) void closeTab(activeTabId)
        },
        'export-html': () => void exportHtml(currentMarkdown(), activeTab()?.name ?? t('tab.untitled')),
        'export-pdf': () => void exportPdf(),
      }
      handlers[action]?.()
    })
    // 自动保存：开启后每 5 秒把脏标签页写回文件
    function scheduleAutosave() {
      window.clearInterval(autosaveTimer)
      if (!autosaveEnabled) return
      autosaveTimer = window.setInterval(() => {
        const t = activeTab()
        if (t?.path && t.dirty && !sourceMode) void saveDocument()
      }, 5000)
    }

    // 启动同步：渲染层为 autosave 状态权威，恢复后通知主进程菜单对齐并按需起定时器
    native?.setAutosaveEnabled(autosaveEnabled)
    if (autosaveEnabled) scheduleAutosave()

    native?.onAutosave((enabled) => {
      autosaveEnabled = enabled
      localStorage.setItem(AUTOSAVE_KEY, enabled ? 'true' : 'false')
      if (enabled) scheduleAutosave()
    })
    // 文件关联：Finder 双击 / 系统打开方式
    native?.onOpenPath((path) => void openPath(path))

    wireFindBar()
    renderFilesSidebar()
    // 就绪信号：主进程补发排队中的待打开文件
    native?.ready()
    // 干净退出（无未保存内容）时清除恢复副本并停掉自动保存定时器
    window.addEventListener('beforeunload', () => {
      window.clearInterval(autosaveTimer)
      if (!tabs.some((t) => t.dirty)) localStorage.removeItem(DOC_KEY)
    })
  } catch (err) {
    // 启动失败时把错误显示出来，方便开发期排查
    const tip = document.createElement('pre')
    tip.style.cssText = 'color:#d1242f;padding:16px;white-space:pre-wrap'
    tip.textContent = t('boot.failed') + (err instanceof Error ? err.stack : String(err))
    document.body.appendChild(tip)
    throw err
  }
}

void boot()
