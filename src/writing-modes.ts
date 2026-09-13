/**
 * 专注模式 / 打字机模式
 *
 * - 专注模式（仅所见即所得）：光标所在块的祖先链经 ProseMirror 装饰器加
 *   .fm-active，CSS 把顶层块与列表项变暗、祖先链全亮——整链标记是为了
 *   避开 opacity 在嵌套结构上的乘算（只亮叶子段落会被上层 ul 的透明度压暗）。
 *   插件常驻，开关切换时派发空事务强制重算装饰器，无需重建编辑器。
 * - 打字机模式（两种模式通用）：监听 DOM selection 变化（rAF 节流），
 *   把折叠光标的视口位置滚到 .page-scroll 垂直中央；纯滚动行为，
 *   与编辑器内核无关，CodeMirror 的原生选区同样适用。
 *
 * @author chiangyang
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import {
  getFocusMode,
  setFocusModeStorage,
  getTypewriterMode,
  setTypewriterModeStorage,
} from './store'

/** 专注模式开关（插件装饰器读取；模块加载时取持久化初值） */
let focusOn = getFocusMode()
/** 打字机模式开关（selectionchange 监听器读取） */
let typewriterOn = getTypewriterMode()

/** 当前 ProseMirror 视图：由插件 view 生命周期持有，避免反向依赖 editor-core */
let pmView: EditorView | null = null

/** 专注模式装饰器插件：光标祖先链（depth 1..depth）逐个加 .fm-active */
export const focusPlugin = $prose(
  () =>
    new Plugin({
      view: (view) => {
        pmView = view
        return {
          destroy: () => {
            if (pmView === view) pmView = null
          },
        }
      },
      props: {
        decorations: (state) => {
          if (!focusOn) return DecorationSet.empty
          const { $head } = state.selection
          const decos: Decoration[] = []
          // 祖先链全部标记：嵌套列表/表格内当前块才能整体压过上层的变暗透明度
          for (let depth = 1; depth <= $head.depth; depth++) {
            decos.push(
              Decoration.node($head.before(depth), $head.after(depth), { class: 'fm-active' }),
            )
          }
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)

/** 切换专注模式：持久化 + body class（CSS 变暗）+ 空事务重算装饰器 */
export function setFocusMode(enabled: boolean): void {
  focusOn = enabled
  setFocusModeStorage(enabled)
  document.body.classList.toggle('focus-mode', enabled)
  // 无步骤空事务：仅触发 decorations 重算，不入撤销历史、不触发文档变更
  pmView?.dispatch(pmView.state.tr)
}

// ---------------------------------------------------------------------------
// 打字机模式
// ---------------------------------------------------------------------------

/** rAF 节流标志（一个帧内多个 selectionchange 只居中一次） */
let rafPending = false

/** 把当前折叠光标滚到滚动容器垂直中央（边界由浏览器钳制，首末段自然停住） */
function centerCursor(): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  // 失焦残留选区或无可视矩形时不动作
  if (rect.height === 0 && rect.width === 0) return
  const anchorEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  // 选区必须落在编辑区内（设置面板等其他区域的选择不响应）
  if (!anchorEl?.closest('#editor, #src-editor')) return

  const container = document.querySelector('.page-scroll') as HTMLElement | null
  if (!container) return
  const cRect = container.getBoundingClientRect()
  const delta = rect.top + rect.height / 2 - (cRect.top + cRect.height / 2)
  if (Math.abs(delta) < 1) return
  container.scrollTop += delta
}

/** 切换打字机模式：开启时立即把光标居中一次 */
export function setTypewriterMode(enabled: boolean): void {
  typewriterOn = enabled
  setTypewriterModeStorage(enabled)
  if (enabled) centerCursor()
}

/** 装配打字机监听（boot 时调用一次；开关关闭时监听器仍在但直接短路） */
export function wireTypewriter(): void {
  document.addEventListener('selectionchange', () => {
    if (!typewriterOn || rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      centerCursor()
    })
  })
}

/** 启动时恢复：专注模式 body class（打字机纯 JS 行为，只需恢复模块变量） */
export function applyWritingModes(): void {
  document.body.classList.toggle('focus-mode', focusOn)
}
