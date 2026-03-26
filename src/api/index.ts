// ============================================================
// Renderer-side API wrapper (calls preload bridge)
// ============================================================

import type {
  CodeSymbol,
  CodeGraph,
  SymbolKind,
  SymbolSummary,
} from '../types/model'
import type { PluginInfo } from '../../plugins/core/types'

const api = () => window.telepathy

export async function listPlugins(): Promise<PluginInfo[]> {
  return api().listPlugins()
}

export async function initPlugin(pluginName: string, dataPath: string): Promise<void> {
  await api().initPlugin(pluginName, dataPath)
}

export async function getClasses(filter?: string): Promise<SymbolSummary[]> {
  return api().getClasses(filter)
}

export async function getClassDetail(classId: string): Promise<CodeSymbol | null> {
  return api().getClassDetail(classId)
}

export async function getClassHierarchy(classId: string): Promise<CodeGraph> {
  return api().getClassHierarchy(classId)
}

export async function searchSymbols(
  query: string,
  kinds?: SymbolKind[],
  limit?: number
): Promise<SymbolSummary[]> {
  return api().searchSymbols(query, kinds, limit)
}

export async function getSourceSnippet(
  file: string,
  line: number,
  contextLines?: number
): Promise<string> {
  return api().getSourceSnippet(file, line, contextLines)
}

export async function openDbDialog(): Promise<string | null> {
  return api().openDbDialog()
}

// ---- Session persistence ----

export async function sessionSave(key: string, data: any): Promise<void> {
  await api().sessionSave(key, data)
}

export async function sessionLoad(key: string): Promise<any | null> {
  return api().sessionLoad(key)
}

export async function sessionDelete(key: string): Promise<void> {
  await api().sessionDelete(key)
}
