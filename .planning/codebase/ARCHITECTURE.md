# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Electron desktop app with plugin-based data layer (Sourcetrail-inspired code visualizer)

**Key Characteristics:**
- **Two-process model:** Electron main process (Node.js / SQLite / plugin system) + renderer process (React / Zustand)
- **Plugin architecture:** `CodeAnalysisPlugin` interface abstracts data sources; currently one plugin (`vs-browse-db`) reads Visual Studio's `Browse.VC.db`
- **IPC boundary:** All data queries cross the main ↔ renderer boundary via `ipcMain.handle()` / `ipcRenderer.invoke()` with a `contextBridge` preload script
- **Single Zustand store:** Flat state with co-located async actions; the store is the single source of truth for the entire UI
- **3-pane layout:** SymbolTree (left) | GraphView (center) | CodePreview (right), resizable via Allotment

## Layers

**Data Source Layer (plugins):**
- Purpose: Read external databases/indexes and normalize data into the unified model
- Location: `plugins/`
- Contains: Plugin interface (`plugins/core/types.ts`), PluginManager (`plugins/core/PluginManager.ts`), concrete plugins (`plugins/vs-browse-db/`)
- Depends on: `src/types/model.ts` (shared data types), `better-sqlite3` (native SQLite driver)
- Used by: IPC handlers in `electron/ipc/handlers.ts`

**IPC / Bridge Layer:**
- Purpose: Marshal data queries between renderer and main process
- Location: `electron/ipc/handlers.ts` (main-side), `electron/preload.ts` (bridge), `src/api/index.ts` (renderer-side wrapper)
- Contains: Channel definitions, request/response routing, file dialog handling
- Depends on: `PluginManager` (main), `window.telepathy` (renderer)
- Used by: Zustand store actions (`src/stores/appStore.ts`)

**State Management Layer:**
- Purpose: Hold all application state and coordinate async data loading
- Location: `src/stores/appStore.ts`
- Contains: Flat state interface (`AppState`) with 18 state fields and 11 action methods
- Depends on: `src/api/index.ts` (IPC calls)
- Used by: All React components via `useAppStore()` hook

**Presentation Layer:**
- Purpose: Render 3-pane UI, graph visualization, source code display
- Location: `src/components/`
- Contains: 5 component directories (Layout, SymbolTree, GraphView, CodePreview, SearchBar)
- Depends on: `useAppStore()`, `@xyflow/react`, `allotment`
- Used by: `src/App.tsx` (root)

**Shared Types Layer:**
- Purpose: Define the unified data model that both plugins and renderer consume
- Location: `src/types/model.ts`
- Contains: `SymbolKind`, `EdgeKind`, `CodeSymbol`, `SymbolEdge`, `CodeGraph`, `SymbolSummary`, `IPC_CHANNELS`
- Depends on: Nothing (leaf module)
- Used by: Every other layer

## Data Flow

**Opening a Database:**

1. User clicks "Open Browse.VC.db" button in `SymbolTree` → calls `api.openDbDialog()` → IPC to main → `dialog.showOpenDialog()`
2. User selects `.db` file → path returned to renderer
3. `store.openDatabase(path)` → `api.initPlugin('vs-browse-db', path)` → IPC to main
4. `PluginManager.activate()` → `VsBrowseDbPlugin.initialize()` → opens SQLite with `better-sqlite3`, prepares 12 SQL statements, builds file cache
5. Auto-calls `store.loadClasses()` → `api.getClasses()` → SQL `SELECT ... FROM code_items WHERE kind IN (1,2) GROUP BY name,kind`
6. `store.classes = result` → `SymbolTree` re-renders with class list

**Selecting a Class:**

1. User clicks tree item / graph node / search result → `store.selectClass(classId)`
2. Store pushes current class to `navBackStack`, clears `navForwardStack`
3. Parallel IPC calls:
   - `api.getClassDetail(id)` → SQL join `code_items` + members → `collectInheritedMembers()` (recursive base walk) → `resolveTypesOnMembers()` (resolves field types to class IDs)
   - `api.getClassHierarchy(id)` → SQL `base_class_parents` traversal → builds `CodeGraph` with Inherits + UsesType edges
4. Store updates: `selectedClass`, `graph`, resets `selectedMember` and `selectedMembers`
5. Auto-loads source: `api.getSourceSnippet(file, line, 30)` → `fs.readFileSync` + line windowing

**Member Selection:**

1. Click member → `store.selectMember(member)` → sets `selectedMember`, loads source snippet
2. Ctrl+Click member → `store.toggleMember(member)` → adds/removes from `selectedMembers` Set
3. `GraphView.buildFlowElements()` recalculates: pinned + active members shown in expanded node; type-reference nodes appear/disappear based on visible members' `typeClassId`

**Back/Forward Navigation:**

1. `store.goBack()` → pops from `navBackStack`, pushes current to `navForwardStack` → loads class without pushing to history
2. `store.goForward()` → inverse of above
3. Keyboard shortcuts: Alt+Left / Alt+Right handled in `App.tsx` via global `keydown` listener

**Search:**

1. Ctrl+K focuses search input in `SearchBar`
2. Debounced (200ms) input → `store.search(query)` → `api.searchSymbols()` → SQL `LIKE` query on `code_items` with relevance ordering
3. Results displayed as dropdown; clicking a class/struct result → `store.selectClass(id)`

**State Management:**

- Single Zustand store at `src/stores/appStore.ts` with `create<AppState>()` — no middleware, no devtools
- State is flat (no nested slices), actions are co-located inline
- Async actions use `get()` to read current state and `set()` to update
- Loading states: `isLoadingClasses`, `isLoadingDetail`, `isLoadingGraph`, `isSearching`
- Store exposed on `window.__telepathyStore` for E2E testing

## Key Abstractions

**CodeAnalysisPlugin:**
- Purpose: Defines a pluggable data source for code structure data
- Defined in: `plugins/core/types.ts`
- Implemented by: `plugins/vs-browse-db/VsBrowseDbPlugin.ts`
- Pattern: Strategy pattern — `PluginManager` routes all queries to the active plugin via proxy methods
- Key methods: `initialize()`, `dispose()`, `getClasses()`, `getClassDetail()`, `getClassHierarchy()`, `searchSymbols()`, `getSourceSnippet()`
- Optional: `getCallGraph()` — not all data sources support call chain data

**PluginManager:**
- Purpose: Registry + router for plugins; only one plugin active at a time
- Location: `plugins/core/PluginManager.ts`
- Pattern: Service locator — holds `Map<string, CodeAnalysisPlugin>`, proxies all data methods to `this.getActive()`
- Lifecycle: `register()` at app start → `activate()` on DB open → `disposeAll()` on window close

**CodeGraph:**
- Purpose: Graph data structure for visualization (nodes + edges)
- Defined in: `src/types/model.ts`
- Pattern: Node/edge list graph — `{ nodes: CodeSymbol[], edges: SymbolEdge[] }`
- Used by: `GraphView` to build ReactFlow nodes/edges via `buildFlowElements()`

**IPC_CHANNELS:**
- Purpose: Shared channel name constants ensuring main and renderer agree on IPC contract
- Location: `src/types/model.ts`
- Pattern: Enum-like const object — `IPC_CHANNELS.GET_CLASSES`, `IPC_CHANNELS.PLUGIN_INIT`, etc.
- Used in: `electron/preload.ts`, `electron/ipc/handlers.ts`

**TelepathyAPI:**
- Purpose: Type-safe bridge API exposed to the renderer via `contextBridge`
- Defined in: `electron/preload.ts` (inferred from `typeof api`)
- Declared globally in: `src/types/global.d.ts` as `window.telepathy`
- Wrapped by: `src/api/index.ts` (adds async typing)

## Entry Points

**Electron Main Process:**
- Location: `electron/main.ts`
- Triggers: `app.whenReady()` → registers `VsBrowseDbPlugin` → registers IPC handlers → creates `BrowserWindow`
- Responsibilities: Plugin lifecycle, IPC handler registration, window management, loading renderer

**Electron Preload:**
- Location: `electron/preload.ts`
- Triggers: Loaded by BrowserWindow before renderer code
- Responsibilities: Exposes `window.telepathy` API via `contextBridge.exposeInMainWorld()`

**Renderer Entry:**
- Location: `src/main.tsx`
- Triggers: Loaded by `src/index.html` as `<script type="module">`
- Responsibilities: Mounts React app (`<App />` in `StrictMode`) to `#root`

**React App Root:**
- Location: `src/App.tsx`
- Triggers: Rendered by `src/main.tsx`
- Responsibilities: App header with nav buttons + search bar, keyboard shortcuts (Alt+Left/Right), mounts `MainLayout`

**E2E Test:**
- Location: `test-electron.mjs`
- Triggers: Manual execution (`node test-electron.mjs`) against running Electron app with `--remote-debugging-port=9222`
- Responsibilities: CDP-based integration tests — opens DB, selects classes, tests member selection/pinning/filtering/sorting/search

## Error Handling

**Strategy:** Try-catch with console.error logging; no global error boundary or user-facing error UI

**Patterns:**
- **Store actions:** Every async action wraps IPC calls in try-catch, logs errors to console, resets loading flags. Example in `src/stores/appStore.ts` `selectClass`:
  ```typescript
  try {
    const [detail, graph] = await Promise.all([...])
    set({ selectedClass: detail, graph, ... })
  } catch (err) {
    console.error('Failed to load class detail:', err)
    set({ isLoadingDetail: false, isLoadingGraph: false })
  }
  ```
- **Plugin initialization:** `VsBrowseDbPlugin.initialize()` throws on missing file; URI-mode SQLite fallback on error
- **Source snippet:** Returns error comment string instead of throwing: `"// File not found: ..."` or `"// Error reading file: ..."`
- **IPC handlers:** No error wrapping — exceptions propagate through `ipcMain.handle()` back to the renderer as rejected promises

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` throughout; `[PluginManager]` and `[VsBrowseDbPlugin]` prefixes in main process

**Validation:** Minimal — `PluginManager.getActive()` throws if no plugin ready; `VsBrowseDbPlugin` checks file existence; no input validation on IPC channel parameters

**Authentication:** Not applicable — desktop app with no network authentication

**Security:**
- `contextIsolation: true`, `nodeIntegration: false` in `electron/main.ts`
- CSP in `src/index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Database opened as `readonly: true`
- External links opened in system browser via `shell.openExternal()`

**Styling:** CSS custom properties (Catppuccin-inspired dark theme) in `src/styles/global.css`; component-scoped CSS files co-located with each component

---

*Architecture analysis: 2026-03-17*
