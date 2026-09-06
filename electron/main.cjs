/**
 * for-mark Electron 主进程
 *
 * 职责：创建窗口、应用菜单（文件操作/导出快捷键）、通过 IPC 提供文件与目录读写。
 * 渲染层保持纯网页逻辑，所有 Node 能力都经由 preload 暴露的受控 API 访问。
 *
 * 模块结构：
 * - 窗口与菜单生命周期（createWindow / buildMenu）
 * - 文件与目录 IPC（open-file / read-file / read-dir / save-* / export-as / print）
 * - 文件关联（open-file 事件 + 单实例锁，双击 .md 直接在本应用打开）
 *
 * @author chiangyang
 */
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL

let mainWindow = null
let autosaveMenuItem = null
let rendererDirty = false
let autosaveEnabled = false

// 菜单文案：默认中文，渲染层启动后把当前语言的文案经 IPC 发来并重建菜单
const DEFAULT_MENU_LABELS = {
  file: '文件',
  open: '打开…',
  openFolder: '打开文件夹…',
  save: '保存',
  saveAs: '另存为…',
  newTab: '新标签页',
  closeTab: '关闭标签页',
  autosave: '自动保存到文件',
  export: '导出',
  exportHtml: '导出 HTML…',
  exportPdf: '打印 / 导出 PDF…',
}
let menuLabels = { ...DEFAULT_MENU_LABELS }

const L = (key) => menuLabels[key] ?? DEFAULT_MENU_LABELS[key]

// 文件关联：Finder 双击 .md 时 macOS 通过 open-file 事件传入路径；
// 渲染层未就绪时先排队，收到 ready 信号后再发给渲染层
const pendingOpenPaths = []
let rendererReady = false

function sendToRenderer(channel, payload) {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(channel, payload)
}

function queueOpenPath(filePath) {
  if (rendererReady && mainWindow) {
    sendToRenderer('for-mark:open-path', filePath)
  } else {
    pendingOpenPaths.push(filePath)
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: L('file'),
      submenu: [
        { label: L('open'), accelerator: 'CmdOrCtrl+O', click: () => sendToRenderer('for-mark:menu', 'open') },
        { label: L('openFolder'), accelerator: 'Shift+CmdOrCtrl+O', click: () => sendToRenderer('for-mark:menu', 'open-folder') },
        { label: L('save'), accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('for-mark:menu', 'save') },
        { label: L('saveAs'), accelerator: 'Shift+CmdOrCtrl+S', click: () => sendToRenderer('for-mark:menu', 'save-as') },
        { type: 'separator' },
        { label: L('newTab'), accelerator: 'CmdOrCtrl+T', click: () => sendToRenderer('for-mark:menu', 'new-tab') },
        { label: L('closeTab'), accelerator: 'CmdOrCtrl+W', click: () => sendToRenderer('for-mark:menu', 'close-tab') },
        { type: 'separator' },
        {
          id: 'autosave',
          label: L('autosave'),
          type: 'checkbox',
          checked: autosaveEnabled,
          click: (item) => {
            autosaveEnabled = item.checked
            sendToRenderer('for-mark:autosave', item.checked)
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: L('export'),
      submenu: [
        { label: L('exportHtml'), accelerator: 'Shift+CmdOrCtrl+H', click: () => sendToRenderer('for-mark:menu', 'export-html') },
        { label: L('exportPdf'), accelerator: 'CmdOrCtrl+P', click: () => sendToRenderer('for-mark:menu', 'export-pdf') },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  autosaveMenuItem = Menu.getApplicationMenu().getMenuItemById('autosave')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    title: 'for-mark',
    backgroundColor: '#ffffff',
    // Mac：隐藏标题栏文字，红绿灯浮在自定义工具栏上（Typora 式沉浸）
    // trafficLightPosition：hiddenInset 的默认垂直位置偏低，按 44px 工具栏手工居中
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 窗口加载完成后，把排队中的待打开文件发给渲染层
  mainWindow.webContents.on('did-finish-load', () => {
    if (rendererReady) {
      while (pendingOpenPaths.length) {
        sendToRenderer('for-mark:open-path', pendingOpenPaths.shift())
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 未保存关闭确认：渲染层通过 IPC 同步脏标记，这里用原生对话框拦截关闭。
  // 不能在渲染层用 window.confirm —— Electron 关闭流程中它不可靠，会导致窗口无法关闭。
  mainWindow.on('close', (event) => {
    if (!rendererDirty) return
    event.preventDefault()
    dialog
      .showMessageBox(mainWindow, {
        type: 'warning',
        message: '有未保存的修改',
        detail: '关闭前会丢失未保存的内容。',
        buttons: ['放弃修改并关闭', '取消'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          rendererDirty = false
          mainWindow?.destroy()
        }
      })
  })
}

// ---------- IPC：文件与目录 ----------

const MD_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown'] }]

ipcMain.handle('for-mark:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: MD_FILTERS,
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  const content = await fs.readFile(filePath, 'utf-8')
  return { path: filePath, name: path.basename(filePath), content }
})

ipcMain.handle('for-mark:read-file', async (_event, filePath) => {
  const content = await fs.readFile(filePath, 'utf-8')
  return { path: filePath, name: path.basename(filePath), content }
})

// 列出文件夹内的 Markdown 文件与子文件夹（两层），用于文件树侧边栏
ipcMain.handle('for-mark:read-dir', async (_event, dirPath) => {
  async function walk(dir, depth) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const folders = []
    const files = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth > 0) folders.push({ name: entry.name, path: full, children: await walk(full, depth - 1) })
      } else if (/\.(md|markdown)$/i.test(entry.name)) {
        files.push({ name: entry.name, path: full })
      }
    }
    return [...folders, ...files]
  }
  try {
    return { path: dirPath, name: path.basename(dirPath), children: await walk(dirPath, 1) }
  } catch {
    return null
  }
})

ipcMain.handle('for-mark:save-file', async (_event, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('for-mark:save-file-as', async (_event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: '未命名.md',
    filters: MD_FILTERS,
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, content, 'utf-8')
  return { path: result.filePath, name: path.basename(result.filePath) }
})

// 通用导出（HTML 等）：弹出另存为对话框并写入
ipcMain.handle('for-mark:export-as', async (_event, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, content, 'utf-8')
  return { path: result.filePath, name: path.basename(result.filePath) }
})

// 打印 / 导出 PDF（走系统打印对话框）
ipcMain.handle('for-mark:print', async () => {
  mainWindow?.webContents.print({ printBackground: true })
  return true
})

// 选择文件夹（文件树）
ipcMain.handle('for-mark:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

// 渲染层同步未保存状态
ipcMain.on('for-mark:set-dirty', (_event, dirty) => {
  rendererDirty = !!dirty
})

// 设置面板同步自动保存开关（保持菜单勾选状态一致）
ipcMain.on('for-mark:set-autosave-enabled', (_event, enabled) => {
  autosaveEnabled = !!enabled
  if (autosaveMenuItem) autosaveMenuItem.checked = autosaveEnabled
})

// 粘贴图片落盘：写入文档同目录 assets/ 文件夹（base64 解码后写入）
ipcMain.handle('for-mark:save-image', async (_event, { dir, name, base64 }) => {
  const assetsDir = path.join(dir, 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  const filePath = path.join(assetsDir, name)
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'))
  return { name }
})

// 渲染层就绪：补发排队中的待打开文件
ipcMain.on('for-mark:ready', () => {
  rendererReady = true
  while (pendingOpenPaths.length) {
    sendToRenderer('for-mark:open-path', pendingOpenPaths.shift())
  }
})

// 渲染层把当前语言的菜单文案发来，重建菜单
ipcMain.on('for-mark:set-locale-info', (_event, labels) => {
  if (labels && typeof labels === 'object') {
    menuLabels = { ...DEFAULT_MENU_LABELS, ...labels }
    buildMenu()
  }
})

// ---------- 生命周期 ----------

// 单实例：再次双击 .md / 启动应用时，把文件转交给已运行的实例
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', (_event, argv) => {
  const filePath = argv.find((arg) => /\.(md|markdown)$/i.test(arg))
  if (filePath) queueOpenPath(filePath)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// macOS：Finder 双击 / 系统打开方式
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  queueOpenPath(filePath)
})

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  // Windows：文件路径在启动参数里
  const argvFile = process.argv.slice(1).find((arg) => /\.(md|markdown)$/i.test(arg))
  if (argvFile) queueOpenPath(argvFile)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
