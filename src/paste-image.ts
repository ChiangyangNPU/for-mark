/**
 * 粘贴图片插件：把剪贴板中的图片文件读为 data URL 并插入文档
 *
 * v0.1 为网页验证阶段，图片以内联 data URL 保存；
 * 进入桌面版（v1.0）后应改为存入文档同目录 assets/ 并替换为相对路径。
 *
 * @author chiangyang
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'

/** 单张图片的大小上限，超过则忽略（data URL 会让文档急速膨胀） */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

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

          for (const file of files) {
            if (file.size > MAX_IMAGE_BYTES) {
              console.warn(`[for-mark] 图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB，已忽略：${file.name}`)
              continue
            }
            const reader = new FileReader()
            reader.onload = () => {
              const nodeType = view.state.schema.nodes.image
              if (!nodeType || typeof reader.result !== 'string') return
              const node = nodeType.create({ src: reader.result, alt: file.name })
              view.dispatch(view.state.tr.replaceSelectionWith(node))
            }
            reader.readAsDataURL(file)
          }
          return true
        },
      },
    }),
)
