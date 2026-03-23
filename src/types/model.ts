// ============================================================
// Telepathy - Unified Data Model
// All plugins produce data conforming to these types
// ============================================================

export enum SymbolKind {
  Class = 'class',
  Struct = 'struct',
  Union = 'union',
  Enum = 'enum',
  Interface = 'interface',
  MemberFunction = 'member_function',
  Function = 'function',
  Member = 'member',
  Variable = 'variable',
  Namespace = 'namespace',
  Typedef = 'typedef',
  Macro = 'macro',
  Enumerator = 'enumerator',
  Unknown = 'unknown',
}

export enum EdgeKind {
  Inherits = 'inherits',       // A inherits from B
  Contains = 'contains',       // A contains B (class contains method)
  Calls = 'calls',             // A calls B
  CalledBy = 'called_by',      // A is called by B
  Overrides = 'overrides',     // A overrides B
  References = 'references',   // A references B
  UsesType = 'uses_type',      // member of A has type B
}

export interface SourceLocation {
  file: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

export interface CodeSymbol {
  id: string
  name: string
  qualifiedName: string        // "ns::Class::method"
  kind: SymbolKind
  location: SourceLocation
  members?: CodeSymbol[]       // populated for classes/structs
  returnType?: string          // for functions/methods
  signature?: string           // full type signature
  parentId?: string            // containing symbol id
  inheritedFrom?: string       // base class name (if inherited member)
  typeClassId?: string         // resolved class id for return type / field type
}

export interface SymbolEdge {
  id: string
  source: string               // source symbol id
  target: string               // target symbol id
  kind: EdgeKind
  label?: string               // optional display label (e.g. method names on call edges)
  location?: SourceLocation    // where the reference occurs
}

export interface CodeGraph {
  nodes: CodeSymbol[]
  edges: SymbolEdge[]
}

// ============================================================
// Tab Management
// ============================================================

/** Per-tab state snapshot (everything that varies between tabs) */
export interface TabState {
  selectedClass: CodeSymbol | null
  previewedClass: CodeSymbol | null   // transient preview (single-click), does not replace graph
  isLoadingDetail: boolean
  selectedMember: CodeSymbol | null
  selectedMembers: Set<string>
  graph: CodeGraph | null
  isLoadingGraph: boolean
  sourceCode: string
  sourceFile: string | null
  sourceLine: number
  navBackStack: string[]
  navForwardStack: string[]
}

/** Tab metadata + stored state for background tabs */
export interface TabInfo {
  id: string
  label: string              // class name or "New Tab"
  state: TabState            // snapshot (only meaningful for background tabs)
}

/** Flattened summary for tree views and search results */
export interface SymbolSummary {
  id: string
  name: string
  qualifiedName: string
  kind: SymbolKind
  file: string
  line: number
  memberCount?: number
}

// ============================================================
// IPC Channel names (shared between main & renderer)
// ============================================================

export const IPC_CHANNELS = {
  // Plugin management
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_INIT: 'plugin:init',

  // Data queries
  GET_CLASSES: 'query:classes',
  GET_CLASS_MEMBERS: 'query:class-members',
  GET_CLASS_HIERARCHY: 'query:class-hierarchy',
  SEARCH_SYMBOLS: 'query:search',
  GET_CALL_GRAPH: 'query:call-graph',
  GET_SOURCE_SNIPPET: 'query:source-snippet',

  // File operations
  OPEN_DB_DIALOG: 'dialog:open-db',
  OPEN_FOLDER_DIALOG: 'dialog:open-folder',
} as const
