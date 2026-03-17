// ============================================================
// VS Browse DB Plugin - reads Browse.VC.db directly
// ============================================================

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import type { CodeAnalysisPlugin, PluginConfig, PluginInfo } from '../core/types'
import {
  SymbolKind,
  EdgeKind,
  type CodeSymbol,
  type CodeGraph,
  type SymbolEdge,
  type SymbolSummary,
  type SourceLocation,
} from '../../src/types/model'

// ---- Browse.VC.db kind mapping ----
const KIND_MAP: Record<number, SymbolKind> = {
  1: SymbolKind.Class,
  2: SymbolKind.Struct,
  3: SymbolKind.Union,
  4: SymbolKind.Enum,
  5: SymbolKind.Typedef,
  6: SymbolKind.MemberFunction,
  7: SymbolKind.Member,
  8: SymbolKind.Enumerator,
  9: SymbolKind.Unknown,        // parameter - skip usually
  17: SymbolKind.Unknown,       // base_class marker
  18: SymbolKind.Namespace,
  27: SymbolKind.Function,
  37: SymbolKind.Macro,
}

/** Map a Browse.VC.db kind int to our SymbolKind */
function mapKind(dbKind: number): SymbolKind {
  return KIND_MAP[dbKind] ?? SymbolKind.Unknown
}

// ---- DB row types ----
interface CodeItemRow {
  id: number
  file_id: number
  parent_id: number
  kind: number
  name: string
  type: string | null
  start_line: number
  start_column: number
  end_line: number
  end_column: number
  member_count?: number
}

interface FileRow {
  id: number
  name: string
  leaf_name: string
}

interface BaseClassRow {
  base_code_item_id: number
  parent_code_item_id: number
}

// ============================================================
// Plugin Implementation
// ============================================================

export class VsBrowseDbPlugin implements CodeAnalysisPlugin {
  readonly info: PluginInfo = {
    name: 'vs-browse-db',
    version: '0.1.0',
    description: 'Reads Visual Studio Browse.VC.db (IntelliSense database)',
    supportedLanguages: ['C++', 'C'],
  }

  private db: Database.Database | null = null
  private fileCache: Map<number, string> = new Map()

  // Prepared statements (lazily created)
  private stmtGetClasses!: Database.Statement
  private stmtGetClassesFiltered!: Database.Statement
  private stmtGetClassDetail!: Database.Statement
  private stmtGetMembers!: Database.Statement
  private stmtGetBases!: Database.Statement
  private stmtGetDerived!: Database.Statement
  private stmtSearchSymbols!: Database.Statement
  private stmtGetFile!: Database.Statement
  private stmtGetItem!: Database.Statement

  async initialize(config: PluginConfig): Promise<void> {
    const dbPath = config.dataPath
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Browse.VC.db not found: ${dbPath}`)
    }

    // Open the database
    // Try URI mode first (immutable=1 avoids locking), fallback to plain readonly
    const uriPath = dbPath.replace(/\\/g, '/')
    try {
      console.log(`[VsBrowseDbPlugin] Trying URI mode: file:${uriPath}?immutable=1`)
      this.db = new Database(`file:${uriPath}?immutable=1`, {
        readonly: true,
      })
    } catch (uriErr) {
      console.log(`[VsBrowseDbPlugin] URI mode failed: ${(uriErr as Error).message}`)
      console.log(`[VsBrowseDbPlugin] Falling back to plain readonly mode: ${dbPath}`)
      this.db = new Database(dbPath, {
        readonly: true,
        fileMustExist: true,
      })
    }

    // Optimize for read-only queries
    this.db.pragma('journal_mode = OFF')
    this.db.pragma('cache_size = -64000') // 64MB cache

    this.prepareStatements()
    this.buildFileCache()

    console.log(`[VsBrowseDbPlugin] Opened: ${dbPath}`)
  }

  async dispose(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
      this.fileCache.clear()
    }
  }

  isReady(): boolean {
    return this.db !== null
  }

  // ---- Prepared statements ----

  private prepareStatements(): void {
    const db = this.db!

    // Get all classes/structs with member counts (kind 1=class, 2=struct)
    // Filter out 0-member entries (forward decls, template instantiations)
    this.stmtGetClasses = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column,
             MAX((SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17))) as member_count
      FROM code_items ci
      WHERE ci.kind IN (1, 2)
        AND (SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17)) > 0
      GROUP BY ci.name, ci.kind
      ORDER BY ci.name COLLATE NOCASE
      LIMIT 5000
    `)

    this.stmtGetClassesFiltered = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column,
             MAX((SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17))) as member_count
      FROM code_items ci
      WHERE ci.kind IN (1, 2) AND ci.name LIKE ?
        AND (SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17)) > 0
      GROUP BY ci.name, ci.kind
      ORDER BY ci.name COLLATE NOCASE
      LIMIT 5000
    `)

    this.stmtGetClassDetail = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column
      FROM code_items ci
      WHERE ci.id = ?
    `)

    // Get direct members of a class
    this.stmtGetMembers = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column
      FROM code_items ci
      WHERE ci.parent_id = ? AND ci.kind NOT IN (9, 17)
      ORDER BY ci.start_line
    `)

    // Get base classes: deduplicated — pick first matching class per base marker
    this.stmtGetBases = db.prepare(`
      SELECT bcp.base_code_item_id, bcp.parent_code_item_id,
             base_marker.name as base_name,
             (SELECT bc.id FROM code_items bc
              WHERE bc.name = base_marker.name AND bc.kind IN (1, 2)
              ORDER BY bc.id LIMIT 1) as base_class_id
      FROM base_class_parents bcp
      JOIN code_items base_marker ON base_marker.id = bcp.base_code_item_id
      WHERE bcp.parent_code_item_id = ?
    `)

    // Get derived classes: find all classes that list this class as a base
    this.stmtGetDerived = db.prepare(`
      SELECT DISTINCT derived.id, derived.file_id, derived.parent_id,
             derived.kind, derived.name, derived.type,
             derived.start_line, derived.start_column,
             derived.end_line, derived.end_column
      FROM base_class_parents bcp
      JOIN code_items base_marker ON base_marker.id = bcp.base_code_item_id
      JOIN code_items derived ON derived.id = bcp.parent_code_item_id
      WHERE base_marker.name = ?
    `)

    // Search symbols by name (LIKE query, kinds 1,2,6,7,27)
    this.stmtSearchSymbols = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column
      FROM code_items ci
      WHERE ci.name LIKE ? AND ci.kind IN (1, 2, 6, 7, 27, 4, 5, 18)
      ORDER BY
        CASE WHEN ci.name LIKE ? THEN 0 ELSE 1 END,
        ci.name COLLATE NOCASE
      LIMIT ?
    `)

    this.stmtGetFile = db.prepare(`SELECT id, name, leaf_name FROM files WHERE id = ?`)
    this.stmtGetItem = db.prepare(`
      SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
             ci.start_line, ci.start_column, ci.end_line, ci.end_column
      FROM code_items ci WHERE ci.id = ?
    `)
  }

  private buildFileCache(): void {
    const rows = this.db!.prepare('SELECT id, name FROM files').all() as FileRow[]
    for (const row of rows) {
      this.fileCache.set(row.id, row.name)
    }
    console.log(`[VsBrowseDbPlugin] Cached ${this.fileCache.size} files`)
  }

  private resolveFile(fileId: number): string {
    return this.fileCache.get(fileId) ?? `<unknown file ${fileId}>`
  }

  // ---- Mapping helpers ----

  private rowToSummary(row: CodeItemRow): SymbolSummary {
    return {
      id: String(row.id),
      name: row.name,
      qualifiedName: row.name, // TODO: build qualified name from parent chain
      kind: mapKind(row.kind),
      file: this.resolveFile(row.file_id),
      line: row.start_line,
    }
  }

  private rowToSymbol(row: CodeItemRow, members?: CodeSymbol[]): CodeSymbol {
    return {
      id: String(row.id),
      name: row.name,
      qualifiedName: row.name,
      kind: mapKind(row.kind),
      location: {
        file: this.resolveFile(row.file_id),
        line: row.start_line,
        column: row.start_column,
        endLine: row.end_line,
        endColumn: row.end_column,
      },
      returnType: row.type ? row.type.replace(/[\x00-\x1f]/g, '').trim() : undefined,
      signature: row.type ? row.type.replace(/[\x00-\x1f]/g, '').trim() : undefined,
      parentId: row.parent_id ? String(row.parent_id) : undefined,
      members,
    }
  }

  // ---- Plugin Interface Implementation ----

  async getClasses(filter?: string): Promise<SymbolSummary[]> {
    let rows: CodeItemRow[]
    if (filter) {
      rows = this.stmtGetClassesFiltered.all(`%${filter}%`) as CodeItemRow[]
    } else {
      rows = this.stmtGetClasses.all() as CodeItemRow[]
    }

    return rows.map(r => {
      const summary = this.rowToSummary(r)
      summary.memberCount = r.member_count ?? 0
      return summary
    })
  }

  async getClassDetail(classId: string): Promise<CodeSymbol | null> {
    const row = this.stmtGetClassDetail.get(Number(classId)) as CodeItemRow | undefined
    if (!row) return null

    const memberRows = this.stmtGetMembers.all(row.id) as CodeItemRow[]
    const members = memberRows.map(m => this.rowToSymbol(m))

    return this.rowToSymbol(row, members)
  }

  async getClassHierarchy(classId: string): Promise<CodeGraph> {
    const nodes: CodeSymbol[] = []
    const edges: SymbolEdge[] = []
    const visited = new Set<string>()

    // Get the root class
    const rootRow = this.stmtGetItem.get(Number(classId)) as CodeItemRow | undefined
    if (!rootRow) return { nodes: [], edges: [] }

    // Load members for the root class (so the expanded graph node shows them)
    const rootMemberRows = this.stmtGetMembers.all(rootRow.id) as CodeItemRow[]
    const rootSymbol = this.rowToSymbol(rootRow, rootMemberRows.map(m => this.rowToSymbol(m)))
    nodes.push(rootSymbol)
    visited.add(classId)

    // Get base classes (parents)
    const baseRows = this.stmtGetBases.all(Number(classId)) as any[]
    for (const base of baseRows) {
      const baseId = base.base_class_id ? String(base.base_class_id) : `marker_${base.base_code_item_id}`
      if (!visited.has(baseId)) {
        visited.add(baseId)
        if (base.base_class_id) {
          const baseRow = this.stmtGetItem.get(base.base_class_id) as CodeItemRow | undefined
          if (baseRow) {
            const baseMemberRows = this.stmtGetMembers.all(baseRow.id) as CodeItemRow[]
            nodes.push(this.rowToSymbol(baseRow, baseMemberRows.map(m => this.rowToSymbol(m))))
          }
        } else {
          // Base class not found in DB - create a placeholder
          nodes.push({
            id: baseId,
            name: base.base_name,
            qualifiedName: base.base_name,
            kind: SymbolKind.Class,
            location: { file: '<external>', line: 0, column: 0 },
          })
        }
      }
      edges.push({
        id: `edge_${classId}_inherits_${baseId}`,
        source: classId,
        target: baseId,
        kind: EdgeKind.Inherits,
      })
    }

    // Get derived classes (children)
    const derivedRows = this.stmtGetDerived.all(rootRow.name) as CodeItemRow[]
    for (const derived of derivedRows) {
      const derivedId = String(derived.id)
      if (!visited.has(derivedId)) {
        visited.add(derivedId)
        nodes.push(this.rowToSymbol(derived))
      }
      edges.push({
        id: `edge_${derivedId}_inherits_${classId}`,
        source: derivedId,
        target: classId,
        kind: EdgeKind.Inherits,
      })
    }

    return { nodes, edges }
  }

  async searchSymbols(query: string, kinds?: SymbolKind[], limit = 50): Promise<SymbolSummary[]> {
    const likePattern = `%${query}%`
    const exactPattern = `${query}%`
    const rows = this.stmtSearchSymbols.all(likePattern, exactPattern, limit) as CodeItemRow[]

    let results = rows.map(r => this.rowToSummary(r))

    // Filter by kinds if specified
    if (kinds && kinds.length > 0) {
      results = results.filter(r => kinds.includes(r.kind))
    }

    return results
  }

  async getSourceSnippet(file: string, line: number, contextLines = 20): Promise<string> {
    try {
      // Normalize the file path
      const normalizedPath = path.normalize(file)
      if (!fs.existsSync(normalizedPath)) {
        return `// File not found: ${file}`
      }

      const content = fs.readFileSync(normalizedPath, 'utf-8')
      const lines = content.split('\n')

      const startLine = Math.max(0, line - contextLines - 1)
      const endLine = Math.min(lines.length, line + contextLines)

      const snippet = lines.slice(startLine, endLine)
      return snippet
        .map((l, i) => `${startLine + i + 1}: ${l}`)
        .join('\n')
    } catch (err) {
      return `// Error reading file: ${(err as Error).message}`
    }
  }
}
