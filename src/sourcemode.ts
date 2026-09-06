/**
 * 源码模式：CodeMirror 6 整篇源码编辑
 * 进出模式时与所见即所得编辑器交换 markdown 全文。
 *
 * @author chiangyang
 */
import { EditorView as CMView, basicSetup } from 'codemirror'
import { markdown as cmMarkdown } from '@codemirror/lang-markdown'

export function createSourceEditor(parent: HTMLElement, markdown: string): CMView {
  return new CMView({
    doc: markdown,
    extensions: [basicSetup, cmMarkdown()],
    parent,
  })
}
