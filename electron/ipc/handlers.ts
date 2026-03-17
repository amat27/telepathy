// ============================================================
// Telepathy - IPC Handlers (main process side)
// ============================================================

import { ipcMain, dialog } from 'electron'
import { IPC_CHANNELS } from '../../src/types/model'
import type { PluginManager } from '../../plugins/core'
import type { SymbolKind } from '../../src/types/model'

export function registerIpcHandlers(pm: PluginManager): void {
  // ---- Plugin management ----

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () => {
    return pm.listPlugins()
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_INIT, async (_event, pluginName: string, dataPath: string) => {
    await pm.activate(pluginName, { dataPath })
    return { success: true }
  })

  // ---- Data queries ----

  ipcMain.handle(IPC_CHANNELS.GET_CLASSES, async (_event, filter?: string) => {
    return pm.getClasses(filter)
  })

  ipcMain.handle(IPC_CHANNELS.GET_CLASS_MEMBERS, async (_event, classId: string) => {
    return pm.getClassDetail(classId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_CLASS_HIERARCHY, async (_event, classId: string) => {
    return pm.getClassHierarchy(classId)
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_SYMBOLS, async (_event, query: string, kinds?: SymbolKind[], limit?: number) => {
    return pm.searchSymbols(query, kinds, limit)
  })

  ipcMain.handle(IPC_CHANNELS.GET_SOURCE_SNIPPET, async (_event, file: string, line: number, contextLines?: number) => {
    return pm.getSourceSnippet(file, line, contextLines)
  })

  // ---- File dialogs ----

  ipcMain.handle(IPC_CHANNELS.OPEN_DB_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Browse.VC.db',
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
