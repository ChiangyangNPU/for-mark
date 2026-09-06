/**
 * 大纲面板：从文档收集标题（1-3 级），点击跳转到对应位置
 */
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { TextSelection } from '@milkdown/kit/prose/state'

export interface OutlineItem {
  level: number
  text: string
  pos: number
}

export function collectOutline(doc: ProseNode): OutlineItem[] {
  const items: OutlineItem[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number
      if (level <= 3) items.push({ level, text: node.textContent, pos })
    }
    return true
  })
  return items
}

export function renderOutline(container: HTMLElement, items: OutlineItem[], view: EditorView) {
  container.textContent = ''
  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'outline-empty'
    empty.textContent = '暂无标题'
    container.appendChild(empty)
    return
  }
  for (const item of items) {
    const row = document.createElement('div')
    row.className = `outline-item level-${item.level}`
    row.textContent = item.text || '（无标题文本）'
    row.addEventListener('click', () => {
      const $pos = view.state.doc.resolve(item.pos + 1)
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.near($pos, 1))
          .scrollIntoView(),
      )
      view.focus()
    })
    container.appendChild(row)
  }
}
