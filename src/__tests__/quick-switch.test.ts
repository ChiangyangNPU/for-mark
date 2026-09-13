import { describe, it, expect } from 'vitest'
import { fuzzyScore, rankEntries } from '../quick-switch'
import type { QuickEntry } from '../quick-switch'

const entry = (name: string, dir = '/docs'): QuickEntry => ({
  name,
  dir,
  path: `${dir}/${name}`,
})

describe('fuzzyScore', () => {
  it('子序列命中返回非空，乱序不命中返回 null', () => {
    expect(fuzzyScore('交互', '交互稿.md')).not.toBeNull()
    expect(fuzzyScore('稿互', '交互稿.md')).toBeNull()
    expect(fuzzyScore('abc', 'axbyc')).not.toBeNull()
    expect(fuzzyScore('acb', 'axbyc')).toBeNull()
  })

  it('大小写不敏感', () => {
    expect(fuzzyScore('ABC', 'xabc')).not.toBeNull()
  })

  it('空查询命中一切且得 0 分', () => {
    expect(fuzzyScore('', '任意')).toBe(0)
  })

  it('词首命中得分高于词中命中', () => {
    const wordStart = fuzzyScore('a', 'abc')! // a 在行首
    const mid = fuzzyScore('a', 'xax')! // 第二个 a 在词中
    expect(wordStart).toBeGreaterThan(mid)
  })

  it('同等起点下连续命中得分高于被隔断的命中', () => {
    const consecutive = fuzzyScore('ab', 'xab')! // a 命中后 b 紧随
    const broken = fuzzyScore('ab', 'xaxb')! // a 命中后被 x 隔断
    expect(consecutive).toBeGreaterThan(broken)
  })
})

describe('rankEntries', () => {
  const entries = [
    entry('交互稿.md', '/docs/设计/旧版'),
    entry('交互评审.md', '/docs/设计'),
    entry('讲稿.md', '/writing'),
    entry('readme.md', '/'),
  ]

  it('只保留命中的候选', () => {
    const ranked = rankEntries('readme', entries)
    expect(ranked.map((r) => r.entry.name)).toEqual(['readme.md'])
  })

  it('查询为空返回全部并按名称长度升序', () => {
    const ranked = rankEntries('', entries)
    expect(ranked).toHaveLength(4)
    expect(ranked[0].entry.name).toBe('讲稿.md')
  })

  it('文件名命中排在仅目录命中之前', () => {
    const ranked = rankEntries('js', [entry('a.md', '/js'), entry('js.md', '/lib')])
    expect(ranked[0].entry.name).toBe('js.md')
  })

  it('同分时文件名短者优先', () => {
    const ranked = rankEntries('ab', [entry('xxab.md'), entry('ab.md')])
    expect(ranked[0].entry.name).toBe('ab.md')
  })
})
