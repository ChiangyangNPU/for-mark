import { describe, it, expect } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { findMatches } from '../find'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { content: 'inline*', group: 'block' },
  },
})

const doc = (texts: string[]) =>
  schema.node('doc', null, texts.map((t) => schema.node('paragraph', null, schema.text(t))))

describe('findMatches', () => {
  it('空查询返回空', () => {
    expect(findMatches(doc(['hello']), '')).toEqual([])
  })

  it('大小写不敏感，位置正确', () => {
    const d = doc(['Hello hello'])
    expect(findMatches(d, 'hello')).toEqual([
      { from: 1, to: 6 },
      { from: 7, to: 12 },
    ])
  })

  it('跨段落分别定位', () => {
    const d = doc(['abc', 'ab'])
    expect(findMatches(d, 'ab')).toEqual([
      { from: 1, to: 3 },
      { from: 6, to: 8 },
    ])
  })

  it('同段重叠匹配不遗漏', () => {
    const d = doc(['aaa'])
    expect(findMatches(d, 'aa')).toEqual([
      { from: 1, to: 3 },
    ])
  })
})
