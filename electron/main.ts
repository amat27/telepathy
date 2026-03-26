// ============================================================
// Telepathy - Electron Main Process
// ============================================================

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'
import { PluginManager } from '../plugins/core'
import { VsBrowseDbPlugin } from '../plugins/vs-browse-db'
import { JsonFileSessionStorage } from './storage'

// ---- Global plugin manager ----
export const pluginManager = new PluginManager()

// ---- Session storage (JSON files in userData/sessions/) ----
export const sessionStorage = new JsonFileSessionStorage(app.getPath('userData'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Telepathy',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev: use Vite dev server; Prod: load built file
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Register plugins
  pluginManager.register(new VsBrowseDbPlugin())

  // Register IPC handlers
  registerIpcHandlers(pluginManager, sessionStorage)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await pluginManager.disposeAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
