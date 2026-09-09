/**
 * Mermaid 实时渲染插件（TMD 核心特性）
 *
 * 组成：
 * 1. remark 转换：把 markdown 里的 ```mermaid 代码块转成内部 "mermaid" 节点
 * 2. 节点 schema：可编辑文本内容的块级节点（区别于官方 diagram 插件的原子节点，
 *    这样光标可以进入源码编辑）
 * 3. 节点视图：光标不在块内时渲染 SVG；点击图表进入源码编辑；渲染失败保留旧图
 * 4. 输入规则：直接输入 ```mermaid 回车即可创建图表块
 * 5. 编辑态装饰：光标位于块内时显示源码、隐藏图表（Typora 行为）
 *
 * @author chiangyang
 */
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet, type EditorView, type NodeView, type ViewMutationRecord } from '@milkdown/kit/prose/view'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { $inputRule, $nodeSchema, $prose, $remark, $view } from '@milkdown/kit/utils'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

/** 主题切换时调用；已有图表块通过重建编辑器完成重渲染 */
export function setMermaidTheme(theme: 'default' | 'dark') {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
}

// ---------------------------------------------------------------------------
// 1. remark 转换：mdast 中 lang === 'mermaid' 的 code 节点 → type === 'mermaid'
// ---------------------------------------------------------------------------

type MdNode = { type: string; lang?: string | null; value?: string | null; children?: MdNode[] }

function convertMermaidBlocks(node: MdNode): void {
  if (!node.children) return
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === 'code' && child.lang === 'mermaid') {
      children[i] = { type: 'mermaid', value: child.value ?? '' }
    } else {
      convertMermaidBlocks(child)
    }
  }
}

const mermaidRemark = $remark('mermaidRemark', () => () => (tree: unknown) => {
  convertMermaidBlocks(tree as MdNode)
})

// ---------------------------------------------------------------------------
// 2. 节点 schema
// ---------------------------------------------------------------------------

const mermaidSchema = $nodeSchema('mermaid', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  code: true,
  defining: true,
  parseDOM: [
    {
      tag: 'pre[data-type="mermaid"]',
      preserveWhitespace: 'full',
      getAttrs: (dom) => ({ value: dom.textContent ?? '' }),
    },
  ],
  toDOM: () => ['pre', { 'data-type': 'mermaid', class: 'mermaid-plain' }, ['code', 0]],
  parseMarkdown: {
    match: ({ type }) => type === 'mermaid',
    runner: (state, node, type) => {
      state.openNode(type)
      const value = (node as { value?: string }).value ?? ''
      if (value) state.addText(value)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'mermaid',
    runner: (state, node) => {
      state.addNode('code', undefined, node.textContent || '', { lang: 'mermaid' })
    },
  },
}))

// ---------------------------------------------------------------------------
// 3. 节点视图
// ---------------------------------------------------------------------------

const RENDER_DEBOUNCE_MS = 400

/** 全部存活的 mermaid 视图，主题切换时统一原地重渲（不重建编辑器） */
const mermaidViews = new Set<MermaidView>()

/** 主题切换后重渲所有已渲染的图表（SVG 内嵌旧主题配色，必须重画） */
export function reThemeMermaid() {
  for (const v of mermaidViews) v.reTheme()
}

class MermaidView implements NodeView {
  dom: HTMLDivElement
  contentDOM: HTMLElement

  private view: EditorView
  private getPos: () => number | undefined

  private renderArea: HTMLDivElement
  private errorTip: HTMLDivElement
  private placeholder: HTMLDivElement
  private srcWrapper: HTMLPreElement

  private lastCode: string | null = null
  private renderSeq = 0
  private timer: number | undefined

  constructor(node: ProseNode, view: EditorView, getPos: () => number | undefined) {
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('div')
    this.dom.classList.add('mermaid-block')

    this.renderArea = document.createElement('div')
    this.renderArea.className = 'mermaid-render'
    this.renderArea.title = '点击编辑源码'

    this.errorTip = document.createElement('div')
    this.errorTip.className = 'mermaid-error'
    this.errorTip.hidden = true

    this.placeholder = document.createElement('div')
    this.placeholder.className = 'mermaid-placeholder'
    this.placeholder.textContent = 'Mermaid 图表（点击编辑源码）'
    this.placeholder.hidden = true

    this.srcWrapper = document.createElement('pre')
    this.srcWrapper.className = 'mermaid-src'
    this.contentDOM = document.createElement('code')
    this.srcWrapper.appendChild(this.contentDOM)

    this.dom.append(this.renderArea, this.errorTip, this.placeholder, this.srcWrapper)

    this.renderArea.addEventListener('click', () => this.enterEdit())
    mermaidViews.add(this)
    this.syncEditing(node)
    this.scheduleRender(node.textContent)
  }

  /** 主题切换：用当前源码重画 SVG（绕过防抖；renderSeq 守卫丢弃过期结果） */
  reTheme() {
    if (this.lastCode != null) void this.renderNow(this.lastCode)
  }

  /** 光标位于本块的内容范围内即视为编辑态（显示源码、隐藏图表） */
  private syncEditing(node: ProseNode) {
    const pos = this.getPos()
    const { from, to } = this.view.state.selection
    const editing = pos != null && from >= pos + 1 && to <= pos + node.nodeSize - 1
    this.dom.classList.toggle('editing', editing)
  }

  private enterEdit() {
    const pos = this.getPos()
    if (pos == null) return
    const $pos = this.view.state.doc.resolve(pos + 1)
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near($pos, 1)))
    this.view.focus()
  }

  private scheduleRender(code: string) {
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void this.renderNow(code), RENDER_DEBOUNCE_MS)
  }

  private async renderNow(code: string, retry = 0) {
    this.lastCode = code
    const seq = ++this.renderSeq

    if (!code.trim()) {
      this.renderArea.innerHTML = ''
      this.placeholder.hidden = false
      this.errorTip.hidden = true
      return
    }
    this.placeholder.hidden = true

    try {
      const id = `tmd-mermaid-${seq}-${Math.random().toString(36).slice(2, 8)}`
      const { svg } = await mermaid.render(id, code)
      if (seq !== this.renderSeq) return // 已有更新的渲染请求，丢弃过期结果
      this.renderArea.innerHTML = svg
      this.errorTip.hidden = true
    } catch (err) {
      if (seq !== this.renderSeq) return
      const message = err instanceof Error ? err.message : String(err)
      // mermaid 图表类型按需懒加载：冷启动立刻渲染会因模块未就绪而报
      // "No diagram type detected"，短暂等待后重试即可恢复
      if (retry < 3 && message.includes('No diagram type detected')) {
        window.setTimeout(() => {
          if (seq === this.renderSeq && this.lastCode === code) void this.renderNow(code, retry + 1)
        }, 400 * (retry + 1))
        return
      }
      // 语法错误时保留上一次成功的图，只显示错误提示
      this.errorTip.textContent = `Mermaid 语法有误：${message}`
      this.errorTip.hidden = false
    }
  }

  update(node: ProseNode, _decorations: readonly Decoration[]): boolean {
    if (node.type.name !== 'mermaid') return false
    this.syncEditing(node)
    if (node.textContent !== this.lastCode) this.scheduleRender(node.textContent)
    return true
  }

  // 自己改动的 SVG 区域不需要交给 ProseMirror 处理；源码区的文本变更必须交还
  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') return false
    return !this.contentDOM.contains(mutation.target)
  }

  // 图表区域的鼠标事件自行处理（点击进入编辑），源码区交给编辑器
  stopEvent(event: Event): boolean {
    return this.renderArea.contains(event.target as Node)
  }

  destroy() {
    window.clearTimeout(this.timer)
    mermaidViews.delete(this)
  }
}

const mermaidView = $view(mermaidSchema.node, () => (node, view, getPos) => new MermaidView(node, view, getPos))

// ---------------------------------------------------------------------------
// 4. 输入规则：输入 ```mermaid 立即转为图表块
// ---------------------------------------------------------------------------

const mermaidInputRule = $inputRule(
  (ctx) =>
    new InputRule(/^```mermaid$/, (state, _match, start, end) => {
      const nodeType = mermaidSchema.type(ctx)
      return state.tr.delete(start, end).setBlockType(start, start, nodeType)
    }),
)

// ---------------------------------------------------------------------------
// 5. 编辑态装饰：光标在 mermaid 块内 → 打上 editing 标记（节点视图据此显示源码）
// ---------------------------------------------------------------------------

const mermaidEditingDecoration = $prose(
  () =>
    new Plugin({
      props: {
        decorations: (state) => {
          const decos: Decoration[] = []
          state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
            if (node.type.name === 'mermaid') {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'editing' }))
            }
          })
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)

/** 全部 mermaid 相关插件，统一给编辑器 .use() */
export const mermaidPlugins = [
  mermaidRemark,
  mermaidSchema,
  mermaidView,
  mermaidInputRule,
  mermaidEditingDecoration,
].flat()
