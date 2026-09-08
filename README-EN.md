[简体中文](./README.md) | English

# TMD

**Type Markdown, Done.**

A cross-platform (macOS / Windows) WYSIWYG Markdown editor with Typora-like interactions. Its core feature is real-time rendering of Mermaid diagrams.

Current progress: **v0.1 (web-core MVP) is complete; the v1.0-stage Electron shell with local file read/write is complete**. The desktop app can be launched with `npm run dev:electron`. For the scope of requirements, see [docs/需求说明.md](docs/需求说明.md).

## Quick Start

```bash
npm install   # Install dependencies first (see note below if the Electron binary download fails)
npm run dev            # Browser mode: http://localhost:5173
npm run dev:electron   # Desktop mode: starts vite and the Electron window together
npm run build          # Type check + production build
npm run dist:dir       # Package as a local directory app (no installer generated)
npm run dist           # Build installer (mac: dmg / win: nsis)
```

> If the Electron binary fails to download on first install (direct GitHub connection issues), use a mirror instead:
> `ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/electron/install.js`

## Implemented (v0.1 + desktop shell)

- WYSIWYG editing (Milkdown / ProseMirror core + GFM: tables, task lists, strikethrough)
- **Real-time Mermaid rendering** (`src/mermaid.ts`, custom plugin):
  - Type ` ```mermaid ` and press Enter to create a diagram block
  - Cursor outside the block: renders SVG; click the diagram: enters source editing; cursor leaves: re-renders
  - 400ms input debounce; on syntax errors, the last successful diagram is kept and an error hint is displayed
  - Stale render requests are discarded (sequence guard), so fast continuous typing never flashes old diagrams
- Code block syntax highlighting (`@milkdown/plugin-prism` + refractor; entering the block edits the source code, consistent with Typora)
- Images: `![]()` rendering; pasted images are auto-inserted (data URL; images >5MB are ignored)
- Dark/light theme switching (Mermaid diagrams re-render with the theme); preferences and documents are auto-saved to localStorage
- Word count, undo/redo
- **Electron desktop shell** (`electron/`):
  - Native open / save / save-as dialogs; File menu shortcuts Cmd/Ctrl+O / S / Shift+S
  - Title bar shows the file name and an unsaved marker (`•`)
  - The renderer keeps pure web logic; Node capabilities are exposed in a controlled way via preload (contextIsolation)
  - Automatic degradation in browser mode: import uses `<input type=file>`, saving becomes a download

## Tech Stack

Electron + TypeScript + Vite + Milkdown + Mermaid + refractor.

## Directory Structure

```
index.html                Page entry
electron/main.cjs         Electron main process (window, menu, IPC file read/write)
electron/preload.cjs      Controlled API exposure (contextBridge)
src/main.ts               App startup, file read/write orchestration, theme switching
src/mermaid.ts            Mermaid real-time rendering plugin (core)
src/paste-image.ts        Pasted-image plugin
src/style.css             All styles (CSS variables for dark/light themes + highlight colors)
docs/需求说明.md           Version scope and requirements checklist
docs/git-multi-remote.md  Guide for Gitee/GitHub dual-remote sync
```
