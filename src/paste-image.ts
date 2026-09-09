/**
 * 粘贴图片插件
 *
 * 存储策略（由设置面板配置，经 setImagePasteContext 注入）：
 * - inline：剪贴板图片转 data URL 内联进文档（默认；无需文档已保存）
 * - assets：图片写入文档同目录 assets/ 文件夹，文档里保存相对路径
 *   （便于迁移与 GitHub 展示；要求文档已保存过，否则自动降级 inline）
 *
 * 相对路径的"显示解析"由 src/image-resolver.ts 完成（文档内容里始终保存相对路径）。
 *
 * @author chiangyang
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import type { Selection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { native } from './native'

export type ImageStrategy = 'inline' | 'assets'

/** 粘贴上下文：策略来自设置面板，目录来自当前标签页的文件路径 */
interface ImagePasteContext {
  getStrategy(): ImageStrategy
  getBaseDir(): string | null
}

let context: ImagePasteContext = {
  getStrategy: () => 'inline',
  getBaseDir: () => null,
}

/** main.ts 启动时注入粘贴上下文（读取设置与当前标签页路径） */
export function setImagePasteContext(next: ImagePasteContext) {
  context = next
}

/** 单张图片的大小上限，超过则忽略（data URL 会让文档急速膨胀） */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

export const pasteImage = $prose(
  () =>
    new Plugin({
      props: {
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
            f.type.startsWith('image/'),
          )
          if (!files.length) return false
          event.preventDefault()

          // 异步插入期间用户可能继续输入，捕获 paste 时刻的选区，
          // 避免图片落到完成时的选区位置（竞态错位）
          const selection = view.state.selection
          for (const file of files) {
            if (file.size > MAX_IMAGE_BYTES) {
              console.warn(`[tmd] 图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB，已忽略：${file.name}`)
              continue
            }
            void insertImage(view, file, selection)
          }
          return true
        },
      },
    }),
)

/** 读取图片并按当前策略插入：assets 落盘失败时自动降级为内联 */
async function insertImage(view: EditorView, file: File, selection: Selection) {
  const dataUrl = await readAsDataURL(file)

  let src = dataUrl
  const strategy = context.getStrategy()
  const baseDir = context.getBaseDir()
  if (strategy === 'assets' && baseDir && native) {
    const savedName = await saveToAssets(baseDir, file, dataUrl)
    if (savedName) src = `assets/${savedName}`
  }

  const nodeType = view.state.schema.nodes.image
  if (!nodeType) return
  const node = nodeType.create({ src, alt: file.name })
  view.dispatch(view.state.tr.setSelection(selection).replaceSelectionWith(node))
}

/** 写入文档同目录 assets/ 文件夹，返回实际文件名；失败返回 null（降级内联） */
async function saveToAssets(baseDir: string, file: File, dataUrl: string): Promise<string | null> {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const ext = MIME_EXT[file.type] ?? '.png'
    const name = `image-${Date.now().toString(36)}${ext}`
    const result = await native?.saveImage({ dir: baseDir, name, base64 })
    return result?.name ?? name
  } catch (err) {
    console.warn('[tmd] 图片落盘失败，降级为内联模式', err)
    return null
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
