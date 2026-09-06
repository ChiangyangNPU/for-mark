/**
 * 文件树 / 最近文件 渲染（数据来自 Electron IPC）
 */
import { t } from './i18n'

export interface FileEntry {
  name: string
  path: string
  children?: FileEntry[]
}

export interface RecentEntry {
  name: string
  path: string
}

export function renderFileTree(
  container: HTMLElement,
  entries: FileEntry[],
  onOpen: (path: string) => void,
  depth = 0,
) {
  for (const item of entries) {
    const row = document.createElement('div')
    row.className = item.children ? 'tree-folder' : 'tree-file'
    row.style.paddingLeft = `${8 + depth * 14}px`
    row.textContent = item.name
    container.appendChild(row)

    if (item.children) {
      const sub = document.createElement('div')
      sub.hidden = true
      row.addEventListener('click', () => {
        sub.hidden = !sub.hidden
      })
      container.appendChild(sub)
      renderFileTree(sub, item.children, onOpen, depth + 1)
    } else {
      row.addEventListener('click', () => onOpen(item.path))
    }
  }
}

export function renderRecent(
  container: HTMLElement,
  recent: RecentEntry[],
  onOpen: (path: string) => void,
) {
  container.textContent = ''
  if (!recent.length) {
    const empty = document.createElement('div')
    empty.className = 'outline-empty'
    empty.textContent = t('files.empty')
    container.appendChild(empty)
    return
  }
  for (const item of recent) {
    const row = document.createElement('div')
    row.className = 'tree-file'
    row.textContent = item.name
    row.title = item.path
    row.addEventListener('click', () => onOpen(item.path))
    container.appendChild(row)
  }
}
