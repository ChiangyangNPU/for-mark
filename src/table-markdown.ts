/**
 * 表格 Markdown 规范化：把「仅含 <br /> 的空单元格」清空为普通空单元格。
 *
 * 背景：Milkdown commonmark 的段落序列化器对「非文档末尾的空段落」统一输出
 * <br />（remarkPreserveEmptyLinePlugin 补偿，用于保留正文空行）。表格里新插入
 * 的行/列是空段落 cell，导出变成 `| <br /> |`；且同一表格行内出现 raw-HTML 后，
 * remark 会把相邻文本连带转义为 code 反引号包裹（数据污染）。
 *
 * 尝试过 extendSchema 覆盖 table_cell 的 toMarkdown：与 gfm 预设的同名 schema
 * 双注册会破坏编辑器插件链（表格工具栏插件失效，已实测），故改为序列化后
 * 处理——与 fillTocBlocks 同一模式，在 currentMarkdown 出口统一规范化。
 *
 * 安全性：html:false 下用户字面输入的 `<br />` 序列化时带反斜杠转义（`\<br />`），
 * 不会被匹配；单元格内「文字 + 换行」的合法 hardbreak（如 `a<br />b`）也不匹配——
 * 只有「| 后紧跟 <br/> 再紧跟 |」的整格占位会被清空。GFM 允许空单元格，
 * remark 解析往返稳定，GitHub/VS Code 等渲染正常。
 *
 * @author chiangyang
 */

/** 「| + 纯 <br/> 占位 + |」的空单元格模式（| 为消费边界，(?=|) 前瞻保后续匹配） */
const EMPTY_CELL_BR = /(\|)\s*<br\s*\/?\s*>\s*(?=\|)/g

/** 清空仅含 <br /> 占位的空单元格（currentMarkdown 出口调用） */
export function normalizeEmptyTableCells(markdown: string): string {
  return markdown.replace(EMPTY_CELL_BR, '$1 ')
}
