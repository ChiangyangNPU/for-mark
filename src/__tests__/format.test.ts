import { describe, it, expect } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import type { Node } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import type { Command } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { MENU_COMMANDS, toggleBlockquote, toggleList } from '../format'

// 与 Milkdown commonmark/gfm 同名的最小 schema，验证命令行为
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    blockquote: { content: 'block+', group: 'block' },
    bullet_list: { content: 'list_item+', group: 'block' },
    ordered_list: { content: 'list_item+', group: 'block' },
    list_item: { content: 'block+' },
    text: { group: 'inline' },
  },
  marks: { strong: {} },
})

const doc = (...blocks: Node[]) => schema.node('doc', null, blocks)
const p = (text = '') => schema.node('paragraph', null, text ? [schema.text(text)] : [])

/** 执行命令（dispatch 捕获事务，不落地），返回是否成功与结果事务 */
function run(cmd: Command, state: EditorState): { ok: boolean; tr: Transaction | null } {
  let tr: Transaction | null = null
  const ok = cmd(state, (t) => {
    tr = t
  })
  return { ok, tr }
}

describe('块级格式切换命令', () => {
  it('toggleBlockquote 把段落包进引用', () => {
    const state = EditorState.create({ doc: doc(p('hello')) })
    const { ok, tr } = run(toggleBlockquote, state)
    expect(ok).toBe(true)
    expect(tr?.doc.firstChild?.type.name).toBe('blockquote')
  })

  it('引用内再按一次退出引用', () => {
    const state = EditorState.create({ doc: doc(schema.node('blockquote', null, [p('hello')])) })
    const { ok, tr } = run(toggleBlockquote, state)
    expect(ok).toBe(true)
    expect(tr?.doc.firstChild?.type.name).toBe('paragraph')
  })

  it('toggleList 包成无序列表，再按一次退出', () => {
    const state = EditorState.create({ doc: doc(p('item')) })
    const first = run(toggleList('bullet_list'), state)
    expect(first.ok).toBe(true)
    const list = first.tr?.doc.firstChild
    expect(list?.type.name).toBe('bullet_list')
    expect(list?.firstChild?.type.name).toBe('list_item')

    const second = run(toggleList('bullet_list'), state.apply(first.tr!))
    expect(second.ok).toBe(true)
    expect(second.tr?.doc.firstChild?.type.name).toBe('paragraph')
  })

  it('fmt-h2 把段落转为二级标题', () => {
    const state = EditorState.create({ doc: doc(p('title')) })
    // MENU_COMMANDS 只读 state.schema，传最小桩即可
    const cmd = MENU_COMMANDS['fmt-h2']({ state } as unknown as EditorView)
    const { ok, tr } = run(cmd, state)
    expect(ok).toBe(true)
    expect(tr?.doc.firstChild?.type.name).toBe('heading')
    expect(tr?.doc.firstChild?.attrs.level).toBe(2)
  })
})
