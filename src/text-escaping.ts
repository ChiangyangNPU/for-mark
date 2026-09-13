/**
 * 序列化补丁：恢复文本转义（修复表格单元格内字面 `|` 不被转义的问题）。
 *
 * 根因：milkdown core 自带的 stringify `text` handler 有个早退捷径——
 *   若文本不含 `*` `_` `\` 且以空白结尾，则 `return value` 原样输出，跳过
 *   全部转义（core 内 `remarkHandlers.text`）。于是「含 `|` 且末尾有空格」的
 *   表格单元格内容会输出裸 `|`，该行单元格数与分隔行不再匹配，重新解析时
 *   整张表退化为纯文本（数据丢失）。
 *   实测对照（单元格内容 `|2x2| `）：
 *     原版 → `| |2x2|  | c |`（未转义）；补丁后 → `| \|2x2\|  | c |`（正确）。
 *
 * 修复：用官方扩展点 `remarkStringifyOptionsCtx` 覆盖 `text` handler，去掉早退
 * 捷径、恒定走 `state.safe()`（`encode: []` 保持 milkdown 原设定：命中字符一律
 * 反斜杠转义）。`mdast-util-to-markdown` 的 safe() 在无命中时原样返回，因此
 * 普通文本不受影响；只有「含需转义标点且以空白结尾」的文本才会多出反斜杠。
 *
 * 时机：`.config()` 回调在 `init` 插件读取该选项之前执行（init 的 runner 先
 * `await ctx.waitTimers([ConfigReady])` 再 `ctx.get(remarkStringifyOptionsCtx)`），
 * 所以在 config 里覆盖是生效且受支持的。
 *
 * @author chiangyang
 */
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'

/** safe() 的最小结构类型（避免依赖传递安装的 mdast-util-to-markdown 类型） */
interface SafeStateLike {
  safe(value: string, config: Record<string, unknown>): string
}

/** 文本节点（只用到 value） */
interface TextNodeLike {
  value: string
}

/**
 * 恒定走 safe() 的文本序列化：等价于 milkdown 原 handler，但去掉
 * 「末尾空白即原样输出」的早退捷径——该捷径正是 `|` 漏转义的来源。
 */
export function safeTextHandler(
  node: TextNodeLike,
  _parent: unknown,
  state: SafeStateLike,
  info: Record<string, unknown>,
): string {
  return state.safe(node.value, { ...info, encode: [] })
}

/** 覆盖 stringify 的 text handler（editor-core 的 config 装配中调用） */
export function patchTextEscaping(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => {
    const options = prev as { handlers?: Record<string, unknown> } & Record<string, unknown>
    // 结构类型与 mdast 内部 State/Handle 类型不重叠（本模块刻意不依赖
    // mdast-util-to-markdown 的类型），故经 unknown 收敛
    return {
      ...options,
      handlers: { ...options.handlers, text: safeTextHandler },
    } as unknown as typeof prev
  })
}
