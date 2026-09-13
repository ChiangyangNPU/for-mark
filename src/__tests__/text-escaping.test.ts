import { describe, it, expect, vi } from 'vitest'
import { safeTextHandler, patchTextEscaping } from '../text-escaping'

describe('safeTextHandler（恒定转义的文本序列化）', () => {
  const mkState = () => {
    const safe = vi.fn((value: string) => `SAFE(${value})`)
    return { state: { safe }, safe }
  }

  it('末尾为空白、不含 *_\\ 的文本仍交给 safe() —— 不再原样返回', () => {
    // milkdown 原 handler 会对该形态早退原样输出，导致表格单元格里的 | 漏转义
    const { state, safe } = mkState()
    const out = safeTextHandler({ value: '|2x2| ' }, null, state, { before: '', after: '|' })
    expect(safe).toHaveBeenCalledTimes(1)
    expect(out).toBe('SAFE(|2x2| )')
  })

  it('原样透传 value 与 info（附 encode: [] 保持 milkdown 设定）', () => {
    const { state, safe } = mkState()
    safeTextHandler({ value: 'a|b' }, null, state, { before: 'x', after: 'y' })
    expect(safe).toHaveBeenCalledWith('a|b', { before: 'x', after: 'y', encode: [] })
  })

  it('空文本也走 safe()（交由底层决定输出）', () => {
    const { state, safe } = mkState()
    safeTextHandler({ value: '' }, null, state, {})
    expect(safe).toHaveBeenCalledWith('', { encode: [] })
  })
})

describe('patchTextEscaping', () => {
  /** 伪造 Ctx：捕获 update 的变换函数并应用到给定 prev 上 */
  const mkCtx = (prev: unknown) => {
    let updater: ((v: unknown) => unknown) | null = null
    const ctx = {
      update: (_slice: unknown, fn: (v: unknown) => unknown) => {
        updater = fn
      },
    }
    return { ctx, run: () => updater?.(prev) }
  }

  it('覆盖 text handler，同时保留 strong/emphasis 与其它选项', () => {
    const strongHandler = () => 'S'
    const emphasisHandler = () => 'E'
    const prev = {
      handlers: { text: () => 'old', strong: strongHandler, emphasis: emphasisHandler },
      encode: [],
    }
    const { ctx, run } = mkCtx(prev)
    patchTextEscaping(ctx as never)
    const next = run() as typeof prev
    expect(next.handlers.text).toBe(safeTextHandler)
    expect(next.handlers.strong).toBe(strongHandler)
    expect(next.handlers.emphasis).toBe(emphasisHandler)
    expect(next.encode).toEqual([])
  })

  it('handlers 缺失时也能安全补上 text', () => {
    const { ctx, run } = mkCtx({ encode: [] })
    patchTextEscaping(ctx as never)
    const next = run() as { handlers: { text: unknown }; encode: unknown }
    expect(next.handlers.text).toBe(safeTextHandler)
    expect(next.encode).toEqual([])
  })
})
