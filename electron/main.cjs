/**
 * for-mark Electron 主进程
 *
 * 职责：创建窗口、应用菜单（打开/保存/另存为快捷键）、通过 IPC 提供文件读写。
 * 渲染层保持纯网页逻辑，所有 Node 能力都经由 preload 暴露的受控 API 访问。
 */
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL

let mainWindow = null

function sendToRenderer(channel) {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(channel)
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendToRenderer('for-mark:menu-open') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('for-mark:menu-save') },
        { label: '另存为…', accelerator: 'Shift+CmdOrCtrl+S', click: () => sendToRenderer('for-mark:menu-save-as') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: 'for-mark',
    backgroundColor: '#ffffff',
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
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------- IPC：文件读写 ----------

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

// ---------- 生命周期 ----------

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
