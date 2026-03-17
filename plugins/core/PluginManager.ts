// ============================================================
// Telepathy - Plugin Manager
// Manages loading, initialization, and routing to plugins
// ============================================================

import type { CodeAnalysisPlugin, PluginConfig, PluginInfo } from './types'
import type { CodeSymbol, CodeGraph, SymbolKind, SymbolSummary } from '../../src/types/model'

export class PluginManager {
  private plugins: Map<string, CodeAnalysisPlugin> = new Map()
  private activePlugin: CodeAnalysisPlugin | null = null

  /** Register a plugin */
  register(plugin: CodeAnalysisPlugin): void {
    this.plugins.set(plugin.info.name, plugin)
    console.log(`[PluginManager] Registered plugin: ${plugin.info.name}`)
  }

  /** List all registered plugins */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(p => p.info)
  }

  /** Initialize and activate a plugin */
  async activate(pluginName: string, config: PluginConfig): Promise<void> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`)
    }

    // Dispose current active plugin
    if (this.activePlugin && this.activePlugin !== plugin) {
      await this.activePlugin.dispose()
    }

    await plugin.initialize(config)
    this.activePlugin = plugin
    console.log(`[PluginManager] Activated plugin: ${pluginName}`)
  }

  /** Get the currently active plugin */
  getActive(): CodeAnalysisPlugin {
    if (!this.activePlugin || !this.activePlugin.isReady()) {
      throw new Error('No active plugin. Open a data source first.')
    }
    return this.activePlugin
  }

  /** Dispose all plugins */
  async disposeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.isReady()) {
        await plugin.dispose()
      }
    }
    this.activePlugin = null
  }

  // ---- Proxy methods (route to active plugin) ----

  async getClasses(filter?: string): Promise<SymbolSummary[]> {
    return this.getActive().getClasses(filter)
  }

  async getClassDetail(classId: string): Promise<CodeSymbol | null> {
    return this.getActive().getClassDetail(classId)
  }

  async getClassHierarchy(classId: string): Promise<CodeGraph> {
    return this.getActive().getClassHierarchy(classId)
  }

  async getCallGraph(symbolId: string, depth?: number): Promise<CodeGraph> {
    const plugin = this.getActive()
    if (!plugin.getCallGraph) {
      throw new Error(`Plugin '${plugin.info.name}' does not support call graph queries`)
    }
    return plugin.getCallGraph(symbolId, depth)
  }

  async searchSymbols(query: string, kinds?: SymbolKind[], limit?: number): Promise<SymbolSummary[]> {
    return this.getActive().searchSymbols(query, kinds, limit)
  }

  async getSourceSnippet(file: string, line: number, contextLines?: number): Promise<string> {
    return this.getActive().getSourceSnippet(file, line, contextLines)
  }
}
