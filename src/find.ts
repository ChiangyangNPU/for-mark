/**
 * 查找替换（所见即所得模式）
 *
 * 通过 ProseMirror 装饰器高亮所有匹配项；不处理跨节点匹配（v1.0 的合理简化）。
 * 源码模式使用 CodeMirror 自带的搜索面板。
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'

export interface MatchRange {
  from: number
  to: number
}

interface FindState {
  query: string
  matches: MatchRange[]
  index: number
}

let state: FindState = { query: '', matches: [], index: -1 }

export function findMatches(doc: ProseNode, query: string): MatchRange[] {
  if (!query) return []
  const results: MatchRange[] = []
  const needle = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const haystack = node.text.toLowerCase()
    let idx = haystack.indexOf(needle)
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + query.length })
      idx = haystack.indexOf(needle, idx + needle.length)
    }
    return true
  })
  return results
}

function sync(view: EditorView) {
  // 触发一次无变更事务，让装饰器重新计算
  view.dispatch(view.state.tr.setMeta('find-update', true))
}

export const findPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations: (s) => {
          if (!state.query || !state.matches.length) return DecorationSet.empty
          const decos = state.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class: i === state.index ? 'find-hit find-current' : 'find-hit',
            }),
          )
          return DecorationSet.create(s.doc, decos)
        },
      },
    }),
)

export function findSetQuery(view: EditorView, query: string) {
  const matches = findMatches(view.state.doc, query)
  state = { query, matches, index: matches.length ? 0 : -1 }
  sync(view)
  return state
}

export function findStep(view: EditorView, delta: 1 | -1): FindState {
  if (!state.matches.length) return state
  state.index = (state.index + delta + state.matches.length) % state.matches.length
  const match = state.matches[state.index]
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView())
  sync(view)
  return state
}

export function findReplaceCurrent(view: EditorView, replacement: string): FindState {
  if (state.index < 0 || !state.matches[state.index]) return state
  const { from, to } = state.matches[state.index]
  view.dispatch(view.state.tr.insertText(replacement, from, to))
  return findSetQuery(view, state.query)
}

export function findReplaceAll(view: EditorView, replacement: string): FindState {
  if (!state.matches.length) return state
  const tr = view.state.tr
  // 从后往前替换，避免位置偏移
  for (const match of [...state.matches].sort((a, b) => b.from - a.from)) {
    tr.insertText(replacement, match.from, match.to)
  }
  view.dispatch(tr)
  return findSetQuery(view, state.query)
}

export function findClear(view: EditorView | null) {
  state = { query: '', matches: [], index: -1 }
  if (view) sync(view)
}

/** 供 UI 读取当前匹配数量与索引 */
export function findState(): FindState {
  return state
}
