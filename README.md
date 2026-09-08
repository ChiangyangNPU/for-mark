简体中文 | [English](./README-EN.md)

# TMD

**Type Markdow, Done.**

跨平台（macOS / Windows）的 Markdown 所见即所得编辑器，交互对标 Typora，核心特性是 Mermaid 图表的实时渲染。

当前进度：**v0.1（网页内核 MVP）已完成；v1.0 阶段的 Electron 壳 + 本地文件读写已完成**，桌面应用可用 `npm run dev:electron` 启动。需求范围见 [docs/需求说明.md](docs/需求说明.md)。

## 快速开始

```bash
npm install   # 首次安装依赖（国内网络 Electron 二进制下载失败时见下方说明）
npm run dev            # 浏览器模式：http://localhost:5173
npm run dev:electron   # 桌面模式：同时启动 vite 和 Electron 窗口
npm run build          # 类型检查 + 生产构建
npm run dist:dir       # 打包为本地目录应用（不生成安装包）
npm run dist           # 打包安装包（mac: dmg / win: nsis）
```

> Electron 二进制首次下载失败（GitHub 直连问题）时，改用镜像：
> `ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/electron/install.js`

## 已实现（v0.1 + 桌面壳）

- 所见即所得编辑（Milkdown / ProseMirror 内核 + GFM：表格、任务列表、删除线）
- **Mermaid 实时渲染**（`src/mermaid.ts`，自研插件）：
  - 输入 ` ```mermaid ` 回车即创建图表块
  - 光标在块外：渲染 SVG；点击图表：进入源码编辑；光标离开：重新渲染
  - 输入防抖 400ms；语法错误时保留上一次成功的图并显示错误提示
  - 过期渲染请求丢弃（序号守卫），连续快速输入不闪旧图
- 代码块语法高亮（`@milkdown/plugin-prism` + refractor，光标进入即编辑源码，与 Typora 一致）
- 图片：`![]()` 渲染、粘贴图片自动插入（data URL，>5MB 忽略）
- 深色/浅色主题切换（Mermaid 图表随主题重渲染），偏好与文档自动保存到 localStorage
- 字数统计、撤销/重做
- **Electron 桌面壳**（`electron/`）：
  - 原生打开/保存/另存为对话框，文件菜单快捷键 Cmd/Ctrl+O / S / Shift+S
  - 标题栏显示文件名与未保存标记（`•`）
  - 渲染层保持纯网页逻辑，Node 能力经 preload 受控暴露（contextIsolation）
  - 浏览器模式自动降级：导入用 `<input type=file>`，保存为下载

## 技术栈

Electron + TypeScript + Vite + Milkdown + Mermaid + refractor。

## 目录结构

```
index.html            页面入口
electron/main.cjs     Electron 主进程（窗口、菜单、IPC 文件读写）
electron/preload.cjs  受控 API 暴露（contextBridge）
src/main.ts           应用启动、文件读写编排、主题切换
src/mermaid.ts        Mermaid 实时渲染插件（核心）
src/paste-image.ts    粘贴图片插件
src/style.css         全部样式（CSS 变量实现深浅主题 + 高亮配色）
docs/需求说明.md       版本范围与需求清单
docs/git-multi-remote.md  Gitee/GitHub 双远程同步指南
```
