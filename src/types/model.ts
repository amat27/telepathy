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
// Saved Views (right panel bookmarks)
// ============================================================

export type SavedViewCategory = 'class-view' | 'callstack'

/** A node in the saved-views tree (view or folder) */
export interface SavedViewNode {
  id: string
  name: string
  type: 'view' | 'folder'
  children?: SavedViewNode[]           // only for folders
  // --- view-specific data ---
  viewType?: SavedViewCategory         // which root this belongs to
  classId?: string                     // for class-view: class to open
  graph?: CodeGraph                    // for callstack: stored graph
  // --- pin state (shared by both view types) ---
  pinnedClassIds?: string[]            // IDs of pinned classes
  pinnedMemberEntries?: { memberId: string; classId: string }[]  // pinned members
}

/** Top-level saved views tree (two fixed roots) */
export interface SavedViewTree {
  classView: SavedViewNode[]
  callstack: SavedViewNode[]
}

// ============================================================
// Pinned Items
// ============================================================

/** A member pinned to the graph (survives navigation) */
export interface PinnedMember {
  member: CodeSymbol       // the member itself (with typeClassId, returnType, etc.)
  classId: string          // parent class id
  className: string        // parent class display name
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
  leftPanelOpen: boolean              // per-tab left panel visibility
  pinnedClasses: Map<string, CodeSymbol>     // classId → class detail (survives navigation)
  pinnedMembers: Map<string, PinnedMember>   // memberId → pinned member info (survives navigation)
  savedViewId: string | null                 // linked saved view id (null = not from a saved view)
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

  // Session persistence
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_DELETE: 'session:delete',
} as const
