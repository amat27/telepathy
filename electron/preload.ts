// ============================================================
// Telepathy - Preload Script
// Exposes a safe API to the renderer process
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../src/types/model'
import type { SymbolKind } from '../src/types/model'

const api = {
  // Plugin management
  listPlugins: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST),
  initPlugin: (pluginName: string, dataPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_INIT, pluginName, dataPath),

  // Data queries
  getClasses: (filter?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CLASSES, filter),
  getClassDetail: (classId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CLASS_MEMBERS, classId),
  getClassHierarchy: (classId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CLASS_HIERARCHY, classId),
  searchSymbols: (query: string, kinds?: SymbolKind[], limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_SYMBOLS, query, kinds, limit),
  getSourceSnippet: (file: string, line: number, contextLines?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SOURCE_SNIPPET, file, line, contextLines),

  // Dialogs
  openDbDialog: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DB_DIALOG),
}

contextBridge.exposeInMainWorld('telepathy', api)

export type TelepathyAPI = typeof api
