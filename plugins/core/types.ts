// ============================================================
// Telepathy - Plugin Interface
// Every data source plugin implements this interface
// ============================================================

import type { CodeSymbol, CodeGraph, SymbolKind, SymbolSummary } from '../../src/types/model'

export interface PluginConfig {
  /** Path to data source (e.g. Browse.VC.db path) */
  dataPath: string
  /** Additional plugin-specific options */
  options?: Record<string, unknown>
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  supportedLanguages: string[]
}

export interface CodeAnalysisPlugin {
  readonly info: PluginInfo

  /** Initialize the plugin with configuration */
  initialize(config: PluginConfig): Promise<void>

  /** Clean up resources */
  dispose(): Promise<void>

  /** Check if the plugin is currently initialized and ready */
  isReady(): boolean

  // ---- Class & Symbol Queries ----

  /** Get all classes/structs with optional name filter */
  getClasses(filter?: string): Promise<SymbolSummary[]>

  /** Get full class detail including members */
  getClassDetail(classId: string): Promise<CodeSymbol | null>

  /** Get class hierarchy (bases and derived classes) */
  getClassHierarchy(classId: string): Promise<CodeGraph>

  // ---- Call Graph (optional - not all plugins support this) ----

  /** Get outgoing calls from a function/method */
  getCallGraph?(symbolId: string, depth?: number): Promise<CodeGraph>

  // ---- Search ----

  /** Fuzzy search across all symbols */
  searchSymbols(query: string, kinds?: SymbolKind[], limit?: number): Promise<SymbolSummary[]>

  // ---- Source Code ----

  /** Get source code snippet around a location */
  getSourceSnippet(file: string, line: number, contextLines?: number): Promise<string>
}
