/**
 * 大纲面板：从文档收集标题（1-3 级），点击跳转到对应位置
 *
 * @author chiangyang
 */
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { TextSelection } from '@milkdown/kit/prose/state'
import { t } from './i18n'
import { collectHeadings } from './toc'

export interface OutlineItem {
  level: number
  text: string
  pos: number
}

/** 收集 1-3 级标题（复用 toc 的标题遍历，slug 计数结果丢弃） */
export function collectOutline(doc: ProseNode): OutlineItem[] {
  return collectHeadings(doc)
    .filter((h) => h.level <= 3)
    .map(({ level, text, pos }) => ({ level, text, pos }))
}

export function renderOutline(container: HTMLElement, items: OutlineItem[], view: EditorView) {
  container.textContent = ''
  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'outline-empty'
    empty.textContent = t('outline.empty')
    container.appendChild(empty)
    return
  }
  for (const item of items) {
    const row = document.createElement('div')
    row.className = `outline-item level-${item.level}`
    row.textContent = item.text || '（无标题文本）'
    row.addEventListener('click', () => {
      const $pos = view.state.doc.resolve(item.pos + 1)
      view.dispatch(view.state.tr.setSelection(TextSelection.near($pos, 1)).scrollIntoView())
      view.focus()
    })
    container.appendChild(row)
  }
}
