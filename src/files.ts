/**
 * 文件操作：打开 / 保存 / 文件夹树 / 最近列表（Electron 原生对话框 + 浏览器降级）。
 *
 * 依赖 tabs（访问器与激活/新建）、editor-core（重建编辑器）、store（最近列表
 * 与恢复副本）、filetree（纯渲染）。
 */
import { native } from './native'
import { replaceEditor, currentMarkdown } from './editor-core'
import {
  activeTab,
  activateTab,
  newTab,
  renderTabs,
  updateTitle,
  findByPath,
  blankTab,
  hasDirty,
} from './tabs'
import { pushRecent, recentList, clearDoc } from './store'
import { renderFileTree, renderRecent } from './filetree'

/** 已打开的文件夹树（文件树侧边栏数据） */
let folderTree: { path: string; name: string; children: import('./filetree').FileEntry[] } | null =
  null

/** 当前打开的文件夹树（快速切换面板枚举用；未打开文件夹时为 null） */
export function getFolderTree(): {
  path: string
  name: string
  children: import('./filetree').FileEntry[]
} | null {
  return folderTree
}

/** 记录一条最近打开文件并刷新侧边栏 */
function pushRecentWithRender(path: string, name: string) {
  pushRecent(path, name)
  renderFilesSidebar()
}

/**
 * 打开文档：
 * - Electron：原生文件选择对话框（自动去重已打开的同路径文件）
 * - 浏览器：降级为 <input type="file">
 */
export async function openDocument() {
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
export async function openFromData(data: { path?: string; name: string; content: string }) {
  // 已打开同一文件 → 跳到那个标签页
  if (data.path) {
    const existing = findByPath(data.path)
    if (existing) {
      await activateTab(existing.id)
      return
    }
    pushRecentWithRender(data.path, data.name)
  }
  // 唯一的"未命名"空白标签页 → 原地替换，避免启动时残留空标签
  // 替换对象：任意"空白新建标签"（无路径、无修改、内容为空、非恢复内容）；
  // 恢复出来的未保存内容带 recovered 标记，不会被打开的文件覆盖
  const only = blankTab()
  if (only) {
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
export async function saveDocument(saveAs = false) {
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
      pushRecentWithRender(result.path, result.name)
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
  if (!hasDirty()) clearDoc()
  renderTabs()
  updateTitle()
}

/** 打开文件夹：读取目录树数据并渲染到文件树侧边栏（仅 Electron） */
export async function openFolder() {
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
export async function openPath(path: string) {
  if (!native) return
  const result = await native.readFile(path)
  await openFromData(result)
}

/** 渲染文件树侧边栏（最近列表 + 文件夹树） */
export function renderFilesSidebar() {
  const recentEl = document.getElementById('recent-list')
  if (recentEl) renderRecent(recentEl, recentList(), (p) => void openPath(p))
  const treeEl = document.getElementById('folder-tree')
  if (treeEl) {
    treeEl.textContent = ''
    if (folderTree) renderFileTree(treeEl, folderTree.children, (p) => void openPath(p))
  }
}
