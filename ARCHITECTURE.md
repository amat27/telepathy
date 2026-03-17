# Architecture

Telepathy is an Electron desktop app with a plugin-based data layer. This document describes the system design, data flow, and key decisions.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron Main Process              │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │ PluginManager │───▶│  CodeAnalysisPlugin(s)     │  │
│  └──────┬───────┘    │  └─ VsBrowseDbPlugin       │  │
│         │            │     (better-sqlite3)        │  │
│         │            └───────────────────────────┘  │
│  ┌──────▼───────┐                                   │
│  │ IPC Handlers  │◀── ipcMain.handle()              │
│  └──────┬───────┘                                   │
│─────────┼───────────────────────────────────────────│
│         │  contextBridge (preload.ts)                │
│─────────┼───────────────────────────────────────────│
│  ┌──────▼───────┐                                   │
│  │  Renderer     │    React 19 + TypeScript          │
│  │               │                                   │
│  │  ┌──────────┐ │                                   │
│  │  │ Zustand   │ │◀── appStore.ts                   │
│  │  │  Store    │ │    (single source of truth)       │
│  │  └────┬─────┘ │                                   │
│  │       │       │                                   │
│  │  ┌────▼──────────────────────────────────┐       │
│  │  │  SymbolTree │ GraphView │ CodePreview  │       │
│  │  │  (left)     │ (center)  │ (right)      │       │
│  │  └────────────────────────────────────────┘       │
│  └───────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

## Process Boundary

Electron enforces a strict main/renderer split:

| Concern | Process | Notes |
|---------|---------|-------|
| SQLite access | Main | `better-sqlite3` is a native module, runs in main only |
| Plugin lifecycle | Main | `PluginManager` registers and activates plugins |
| File I/O (source code) | Main | Reads `.cpp`/`.h` files from disk |
| UI rendering | Renderer | React, sandboxed, no `nodeIntegration` |
| State management | Renderer | Zustand store, single source of truth for UI |

Communication crosses the boundary via **IPC channels** defined in `src/types/model.ts` (`IPC_CHANNELS`), bridged through `preload.ts` (`contextBridge`).

## Plugin System

### Interface

Every data source implements `CodeAnalysisPlugin` (`plugins/core/types.ts`):

```typescript
interface CodeAnalysisPlugin {
  info: PluginInfo
  initialize(config: PluginConfig): Promise<void>
  dispose(): Promise<void>
  isReady(): boolean
  getClasses(filter?: string): Promise<SymbolSummary[]>
  getClassDetail(classId: string): Promise<CodeSymbol | null>
  getClassHierarchy(classId: string): Promise<CodeGraph>
  getCallGraph?(symbolId: string, depth?: number): Promise<CodeGraph>
  searchSymbols(query: string, kinds?: SymbolKind[], limit?: number): Promise<SymbolSummary[]>
  getSourceSnippet(file: string, line: number, contextLines?: number): Promise<string>
}
```

`getCallGraph` is optional — not all data sources can provide call chain data.

### PluginManager

`PluginManager` (`plugins/core/PluginManager.ts`) is a registry that:
1. Holds a map of `name → plugin` instances
2. Proxies IPC handler calls to the active plugin
3. Manages plugin initialization and disposal

### Current Plugin: vs-browse-db

`VsBrowseDbPlugin` reads Visual Studio's `Browse.VC.db` (SQLite) using `better-sqlite3`.

Key implementation details:

| Problem | Solution |
|---------|----------|
| Duplicate classes across translation units | `GROUP BY ci.name, ci.kind` deduplication |
| 0-member forward declarations / template instantiations | `WHERE EXISTS (subquery for members)` filter |
| Control characters in `type` column (`\u0001\u0002`) | `.replace(/[\x00-\x1f]/g, '').trim()` |
| Duplicate base class matches from multi-TU joins | Subquery with `LIMIT 1` per base class name |
| `better-sqlite3` doesn't support URI mode | Fallback to plain `readonly: true` open |

### Browse.VC.db Schema (v18)

```
code_items (id, file_id, parent_id, kind, name, type, line, column, ...)
  kind: 1=class, 2=struct, 6=member_function, 7=member, 9=parameter,
        17=base_class_marker, 27=function

base_class_parents (base_code_item_id, parent_code_item_id)
  base_code_item_id  → kind=17 marker in code_items
  parent_code_item_id → the derived class

files (id, name)

symbols / symbol_refs / symbol_relations → EMPTY (no call data)
```

## Data Flow

### Opening a Database

```
User action
  → store.openDatabase(path)
    → IPC: initPlugin('vs-browse-db', path)
      → PluginManager.initialize() → VsBrowseDbPlugin.initialize()
        → opens SQLite connection
    → IPC: getClasses()
      → SQL: SELECT ... FROM code_items WHERE kind IN (1,2) GROUP BY name,kind
    → store.classes = result
      → SymbolTree re-renders
```

### Selecting a Class

```
Click tree item
  → store.selectClass(id)
    → parallel:
      │ IPC: getClassDetail(id) → SQL join code_items + members
      │ IPC: getClassHierarchy(id) → SQL base_class_parents traversal
    → store.selectedClass = detail
    → store.graph = hierarchy
    → auto: loadSource(file, line)
      → IPC: getSourceSnippet() → fs.readFileSync + line windowing
```

### Member Selection & Pin

```
Click member:
  → store.selectMember(member)   // sets selectedMember, loads source
  → GraphView shows only this member in expanded node

Ctrl+Click member:
  → store.toggleMember(member)   // adds/removes from selectedMembers Set
  → GraphView shows all pinned + currently active member
```

## Renderer Components

### Layout (`src/components/Layout/`)

3-pane resizable layout using `Allotment`:

```
┌─────────────┬──────────────────┬─────────────────┐
│ SymbolTree  │    GraphView     │  CodePreview    │
│ (250px min) │    (flexible)    │  (300px min)    │
│             │                  │                  │
│ - Filter    │  - React Flow    │  - Members list │
│ - Class     │  - Expanded node │    - Filter     │
│   list      │  - Inheritance   │    - Sort       │
│             │    edges         │    - Group      │
│             │                  │    - Pin        │
│             │                  │  - Source code  │
└─────────────┴──────────────────┴─────────────────┘
```

### SymbolTree (`src/components/SymbolTree/`)

Left panel. Text filter input + scrollable list of `SymbolSummary` items. Shows class name, kind badge, and member count.

### GraphView (`src/components/GraphView/`)

Center panel. Uses `@xyflow/react` with two custom node types:

- **ExpandedClassNode** — the selected class, shows pinned/active members split by fields/methods
- **ClassNode** — compact node for base/derived classes in the hierarchy

Edges represent inheritance (base → derived). Layout is computed with a simple center-out algorithm (root at center, bases above, derived below).

### CodePreview (`src/components/CodePreview/`)

Right panel, split into two sections:

1. **Members toolbar + list** — filter input, sort dropdown, group toggle (G button), member items with Ctrl+Click pin
2. **Source viewer** — line-numbered code with highlighted active line, auto-scrolls to selection

### SearchBar (`src/components/SearchBar/`)

Ctrl+K modal overlay. Debounced input triggers `store.search()`, results displayed as a dropdown. Click a result to navigate to that class.

## State Management

Single Zustand store (`src/stores/appStore.ts`) with flat state:

```typescript
interface AppState {
  // Connection
  isConnected: boolean; dbPath: string | null

  // Left panel
  classes: SymbolSummary[]; classFilter: string

  // Selection
  selectedClass: CodeSymbol | null
  selectedMember: CodeSymbol | null      // active (clicked) member
  selectedMembers: Set<string>           // pinned member IDs (Ctrl+Click)

  // Center panel
  graph: CodeGraph | null

  // Right panel
  sourceCode: string; sourceFile: string | null; sourceLine: number

  // Search
  searchQuery: string; searchResults: SymbolSummary[]
}
```

The store is exposed on `window.__telepathyStore` for E2E testing via CDP.

## Testing

E2E tests (`test-electron.mjs`) connect to Electron via Playwright's CDP adapter:

1. Connect to `localhost:9222`
2. Access the Zustand store directly via `window.__telepathyStore`
3. Call store actions (e.g. `openDatabase`, `search`) and verify state
4. Interact with DOM elements and assert visual results
5. Capture screenshots to `test-screenshots/`

This approach bypasses the need for a test harness inside the Electron app — the store exposure is the only test-specific code.

## Known Limitations

- **No call graph data** — `Browse.VC.db` `symbol_refs`/`symbol_relations` tables are empty. Would need a VSIX extension or clangd for call chain data.
- **Single plugin** — only `vs-browse-db` is implemented. Future plugins could read `compile_commands.json`, clangd index, or other IDEs' databases.
- **No incremental updates** — the DB is read once on open. If VS rebuilds the DB, you must reopen.
- **Windows-only testing** — paths and Electron binary assume Windows. The architecture is cross-platform but hasn't been tested elsewhere.
