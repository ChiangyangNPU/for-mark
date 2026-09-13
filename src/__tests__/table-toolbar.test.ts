import { describe, it, expect } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import type { Node } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { CellSelection, TableMap } from '@milkdown/kit/prose/tables'
import { findTableContext, runTableAction } from '../table-toolbar'
import type { EditorView } from '@milkdown/kit/prose/view'

// 与 Milkdown gfm 同名、带 tableRole 的最小表格 schema（prosemirror-tables 依赖 role）
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    table: {
      content: 'table_header_row table_row+',
      tableRole: 'table',
      group: 'block',
    },
    table_header_row: { content: 'table_header*', tableRole: 'row' },
    table_row: { content: 'table_cell*', tableRole: 'row' },
    table_header: {
      content: 'paragraph*',
      tableRole: 'header_cell',
      attrs: {
        alignment: { default: null },
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
    },
    table_cell: {
      content: 'paragraph*',
      tableRole: 'cell',
      attrs: {
        alignment: { default: null },
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
    },
  },
})

/** 构造 rows×cols 表格：首行为表头，单元格文本 r{row}c{col} */
const makeTable = (rows: number, cols: number): Node =>
  schema.node('table', null, [
    schema.node(
      'table_header_row',
      null,
      Array.from({ length: cols }, (_, c) =>
        schema.node('table_header', null, [schema.node('paragraph', null, [schema.text(`h${c}`)])]),
      ),
    ),
    ...Array.from({ length: rows - 1 }, (_, r) =>
      schema.node(
        'table_row',
        null,
        Array.from({ length: cols }, (_, c) =>
          schema.node('table_cell', null, [
            schema.node('paragraph', null, [schema.text(`r${r + 1}c${c}`)]),
          ]),
        ),
      ),
    ),
  ])

/** 把光标放进指定行列的单元格里（表格包进 doc，位于文档开头） */
const stateIn = (table: Node, row: number, col: number): EditorState => {
  const doc = schema.node('doc', null, [table])
  const map = TableMap.get(table)
  const cellRel = map.positionAt(row, col, table)
  const $pos = doc.resolve(cellRel + 1)
  return EditorState.create({ doc, selection: TextSelection.near($pos) })
}

const stubView = (state: EditorState): EditorView =>
  ({
    state,
    dispatch: () => {},
    focus: () => {},
  }) as unknown as EditorView

describe('findTableContext', () => {
  it('解析光标所在表格与行列下标', () => {
    const table = makeTable(3, 3)
    const ctx = findTableContext(stateIn(table, 2, 1))
    expect(ctx).not.toBeNull()
    expect(ctx?.row).toBe(2)
    expect(ctx?.col).toBe(1)
    expect(ctx?.map.width).toBe(3)
    expect(ctx?.map.height).toBe(3)
  })

  it('光标不在表格内返回 null', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('plain')])])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    })
    expect(findTableContext(state)).toBeNull()
  })
})

describe('表格动作', () => {
  it('光标在表格外时动作返回 false', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('plain')])])
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
    expect(runTableAction(stubView(state), 'row-after')).toBe(false)
    expect(runTableAction(stubView(state), 'align-center')).toBe(false)
  })

  it('row-after 在表格内可执行', () => {
    const table = makeTable(2, 2)
    const state = stateIn(table, 0, 0)
    const result: { doc: Node | null } = { doc: null }
    const view = {
      state,
      focus: () => {},
      dispatch: (tr: { doc: Node }) => {
        result.doc = tr.doc
      },
    } as unknown as EditorView
    expect(runTableAction(view, 'row-after')).toBe(true)
    expect(result.doc?.firstChild?.childCount).toBe(3) // 2 行 → 3 行
  })

  it('col-delete 删除当前列（列数减一）', () => {
    const table = makeTable(2, 3)
    const state = stateIn(table, 1, 1)
    const result: { doc: Node | null } = { doc: null }
    const view = {
      state,
      focus: () => {},
      dispatch: (tr: { doc: Node }) => {
        result.doc = tr.doc
      },
    } as unknown as EditorView
    expect(runTableAction(view, 'col-delete')).toBe(true)
    expect(result.doc?.firstChild?.firstChild?.childCount).toBe(2) // 3 列 → 2 列
  })

  it('align-center 更新当前列表头单元格的 alignment', () => {
    const table = makeTable(2, 2)
    const state = stateIn(table, 0, 1) // 光标在表头第 2 列
    const result: { doc: Node | null } = { doc: null }
    const view = {
      state,
      focus: () => {},
      dispatch: (tr: { doc: Node }) => {
        result.doc = tr.doc
      },
    } as unknown as EditorView
    expect(runTableAction(view, 'align-center')).toBe(true)
    const headerCell = result.doc?.firstChild?.firstChild?.child(1)
    expect(headerCell?.attrs.alignment).toBe('center')
  })

  it('整列 CellSelection 构造覆盖该列首尾单元格', () => {
    const table = makeTable(3, 3)
    const state = stateIn(table, 1, 1)
    const ctx = findTableContext(state)!
    const positions = ctx.map
      .cellsInRect({ left: 1, right: 2, top: 0, bottom: 3 })
      .map((rel) => ctx.tablePos + 1 + rel)
    expect(positions).toHaveLength(3)
    const sel = CellSelection.create(state.doc, positions[0], positions[2])
    expect(sel.$anchorCell.pos).toBe(positions[0])
    expect(sel.$headCell.pos).toBe(positions[2])
  })
})
