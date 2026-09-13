import { describe, it, expect } from 'vitest'
import { normalizeEmptyTableCells } from '../table-markdown'

describe('normalizeEmptyTableCells', () => {
  it('清空仅含 <br /> 的空单元格（新插入行列的占位）', () => {
    const input = '| a | <br /> |\n| --- | --- |\n| b |  |'
    expect(normalizeEmptyTableCells(input)).toBe('| a | |\n| --- | --- |\n| b |  |')
  })

  it('一行内多个空单元格全部清空', () => {
    expect(normalizeEmptyTableCells('| <br /> | <br /> |')).toBe('| | |')
  })

  it('<br> 无自闭合斜杠、带空格变体同样清空', () => {
    expect(normalizeEmptyTableCells('| x |<br>|')).toBe('| x | |')
    expect(normalizeEmptyTableCells('| x | <br/> |')).toBe('| x | |')
  })

  it('单元格内的合法换行（文字 + <br />）不受影响', () => {
    const input = '| a<br />b | c |'
    expect(normalizeEmptyTableCells(input)).toBe(input)
  })

  it('用户字面输入的转义 \\<br /> 不受影响（html:false 序列化形态）', () => {
    const input = '| \\<br /> | x |'
    expect(normalizeEmptyTableCells(input)).toBe(input)
  })

  it('正文中的 <br /> 空行占位不受影响（非表格）', () => {
    const input = '第一段\n\n<br />\n\n第二段'
    expect(normalizeEmptyTableCells(input)).toBe(input)
  })

  it('无表格内容原样返回', () => {
    const input = '# 标题\n\n正文段落。'
    expect(normalizeEmptyTableCells(input)).toBe(input)
  })

  it('幂等：重复规范化结果不变', () => {
    const once = normalizeEmptyTableCells('| a | <br /> |')
    expect(normalizeEmptyTableCells(once)).toBe(once)
  })
})
