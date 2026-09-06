# for-mark

跨平台（macOS / Windows）的 Markdown 所见即所得编辑器，交互对标 Typora，核心特性是 Mermaid 图表的实时渲染。

当前处于 **v0.1（MVP：网页内核验证版）** 阶段，需求范围见 [docs/需求说明.md](docs/需求说明.md)。

## 快速开始

```bash
npm install   # 首次安装依赖
npm run dev   # 启动开发服务器，浏览器打开 http://localhost:5173
npm run build # 类型检查 + 生产构建
```

## 已实现（v0.1）

- 所见即所得编辑（Milkdown / ProseMirror 内核 + GFM：表格、任务列表、删除线）
- **Mermaid 实时渲染**（`src/mermaid.ts`，自研插件）：
  - 输入 ` ```mermaid ` 回车即创建图表块
  - 光标在块外：渲染 SVG；点击图表：进入源码编辑；光标离开：重新渲染
  - 输入防抖 400ms；语法错误时保留上一次成功的图并显示错误提示
  - 过期渲染请求丢弃（序号守卫），连续快速输入不闪旧图
- 深色/浅色主题切换（Mermaid 图表随主题重渲染），偏好与文档自动保存到 localStorage
- 字数统计、撤销/重做

## 技术栈

Electron（后续阶段） + TypeScript + Vite + Milkdown + Mermaid + CodeMirror 6（后续）。

## 目录结构

```
index.html          页面入口
src/main.ts         应用启动、主题切换、本地存储
src/mermaid.ts      Mermaid 实时渲染插件（核心）
src/style.css       全部样式（CSS 变量实现深浅主题）
docs/需求说明.md     版本范围与需求清单
```
