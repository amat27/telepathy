# Codebase Structure

**Analysis Date:** 2026-03-17

## Directory Layout

```
telepathy/
├── .github/
│   ├── prompts/                # OpenSpec AI prompt templates
│   └── skills/                 # OpenSpec AI skill definitions
├── .planning/
│   ├── codebase/               # GSD codebase analysis docs (this directory)
│   └── config.json             # GSD workflow configuration
├── electron/                   # Electron main process code
│   ├── ipc/
│   │   └── handlers.ts         # IPC request handlers (main-side)
│   ├── main.ts                 # App entry: window creation, plugin registration
│   └── preload.ts              # contextBridge API exposed to renderer
├── openspec/
│   └── config.yaml             # OpenSpec schema config (unused)
├── plugins/                    # Plugin system (runs in main process)
│   ├── core/
│   │   ├── index.ts            # Barrel export
│   │   ├── PluginManager.ts    # Plugin registry + active plugin router
│   │   └── types.ts            # CodeAnalysisPlugin interface + PluginConfig/PluginInfo
│   └── vs-browse-db/
│       ├── index.ts            # Barrel export
│       └── VsBrowseDbPlugin.ts # Browse.VC.db reader (SQLite, 593 lines)
├── src/                        # Renderer process (React app)
│   ├── api/
│   │   └── index.ts            # Renderer-side IPC wrapper functions
│   ├── components/
│   │   ├── CodePreview/
│   │   │   ├── CodePreview.css # Right panel styles
│   │   │   └── CodePreview.tsx # Member list + source code viewer (313 lines)
│   │   ├── GraphView/
│   │   │   ├── GraphView.css   # Graph styles (node colors, edges)
│   │   │   └── GraphView.tsx   # ReactFlow graph visualization (398 lines)
│   │   ├── Layout/
│   │   │   ├── Layout.css      # 3-pane layout styles
│   │   │   └── Layout.tsx      # Allotment-based resizable panes
│   │   ├── SearchBar/
│   │   │   ├── SearchBar.css   # Search overlay styles
│   │   │   └── SearchBar.tsx   # Ctrl+K search modal with debounce
│   │   └── SymbolTree/
│   │       ├── SymbolTree.css  # Left panel styles
│   │       └── SymbolTree.tsx  # Class/struct list with filter
│   ├── stores/
│   │   └── appStore.ts         # Zustand store: all state + actions (264 lines)
│   ├── styles/
│   │   └── global.css          # CSS custom properties, dark theme, scrollbar styles
│   ├── types/
│   │   ├── global.d.ts         # window.telepathy type declaration
│   │   └── model.ts            # Unified data model (enums, interfaces, IPC channels)
│   ├── App.css                 # App header + nav button styles
│   ├── App.tsx                 # Root component: header, nav, search, layout
│   ├── index.html              # HTML shell with CSP
│   └── main.tsx                # React mount point (createRoot)
├── .gitignore
├── ARCHITECTURE.md             # Detailed architecture doc (root-level, hand-written)
├── electron.vite.config.ts     # Vite config: main/preload/renderer build targets
├── package.json                # Dependencies and scripts
├── package-lock.json
├── README.md
├── test-electron.mjs           # E2E test script (CDP-based, Playwright)
├── tsconfig.json               # Base TypeScript config
├── tsconfig.node.json          # TS config for main process (electron/ + plugins/)
└── tsconfig.web.json           # TS config for renderer (src/)
```

## Directory Purposes

**`electron/`:**
- Purpose: Electron main process — app lifecycle, window management, IPC handlers
- Contains: Entry point (`main.ts`), preload bridge (`preload.ts`), IPC handler registration (`ipc/handlers.ts`)
- Key files: `electron/main.ts` (app entry), `electron/preload.ts` (API bridge)

**`plugins/`:**
- Purpose: Plugin system for abstracting data sources; runs in the main process
- Contains: Core plugin framework (`plugins/core/`) and concrete plugin implementations (`plugins/vs-browse-db/`)
- Key files: `plugins/core/types.ts` (interface definition), `plugins/core/PluginManager.ts` (registry), `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (SQLite reader)

**`plugins/core/`:**
- Purpose: Plugin framework — interface definition and manager class
- Contains: `CodeAnalysisPlugin` interface, `PluginConfig`/`PluginInfo` types, `PluginManager` class
- Key files: `plugins/core/types.ts`, `plugins/core/PluginManager.ts`

**`plugins/vs-browse-db/`:**
- Purpose: Reads Visual Studio Browse.VC.db files via better-sqlite3
- Contains: Single plugin implementation with prepared SQL statements, type resolution, inherited member collection
- Key files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (593 lines — largest file in codebase)

**`src/`:**
- Purpose: Renderer process — React UI, state management, API wrappers
- Contains: Components, store, types, styles, HTML entry
- Key files: `src/main.tsx` (React mount), `src/App.tsx` (root component)

**`src/api/`:**
- Purpose: Typed wrapper around `window.telepathy` preload API
- Contains: One file with async function exports matching the preload bridge
- Key files: `src/api/index.ts`

**`src/components/`:**
- Purpose: React UI components organized by feature/panel
- Contains: 5 feature directories, each with a `.tsx` + `.css` pair
- Key files: `GraphView.tsx` (398 lines), `CodePreview.tsx` (313 lines)

**`src/stores/`:**
- Purpose: Application state management via Zustand
- Contains: Single store file with flat state and async actions
- Key files: `src/stores/appStore.ts` (264 lines)

**`src/types/`:**
- Purpose: Shared TypeScript types and enums used by both main and renderer
- Contains: Unified data model + global type declarations
- Key files: `src/types/model.ts` (99 lines — core data model), `src/types/global.d.ts`

**`src/styles/`:**
- Purpose: Global CSS — theme variables, base resets, scrollbar styling
- Contains: One global CSS file with CSS custom properties
- Key files: `src/styles/global.css`

## Key File Locations

**Entry Points:**
- `electron/main.ts`: Electron main process entry — app startup, plugin registration, window creation
- `electron/preload.ts`: Preload script — `contextBridge` API exposure
- `src/main.tsx`: React renderer entry — mounts `<App />` to `#root`
- `src/index.html`: HTML shell — CSP headers, loads `main.tsx`

**Configuration:**
- `electron.vite.config.ts`: Build config for main/preload/renderer targets
- `tsconfig.json`: Base TypeScript config (ES2022, bundler resolution, `@/*` path alias)
- `tsconfig.node.json`: Extends base for main process (`electron/` + `plugins/`)
- `tsconfig.web.json`: Extends base for renderer (`src/`)
- `package.json`: Dependencies, scripts (`dev`, `build`, `preview`, `rebuild-native`)

**Core Logic:**
- `plugins/core/types.ts`: `CodeAnalysisPlugin` interface — the plugin contract
- `plugins/core/PluginManager.ts`: Plugin registry and query routing
- `plugins/vs-browse-db/VsBrowseDbPlugin.ts`: Browse.VC.db reader — SQL queries, type resolution, inherited member collection
- `src/stores/appStore.ts`: All application state and action logic
- `src/types/model.ts`: `SymbolKind`, `EdgeKind`, `CodeSymbol`, `CodeGraph`, `SymbolSummary`, `IPC_CHANNELS`

**Presentation:**
- `src/App.tsx`: Root component — header, nav buttons, keyboard shortcuts
- `src/components/Layout/Layout.tsx`: 3-pane Allotment layout
- `src/components/GraphView/GraphView.tsx`: ReactFlow visualization with custom node types
- `src/components/CodePreview/CodePreview.tsx`: Member list + source code viewer
- `src/components/SymbolTree/SymbolTree.tsx`: Filterable class/struct tree
- `src/components/SearchBar/SearchBar.tsx`: Ctrl+K search overlay

**Testing:**
- `test-electron.mjs`: E2E test script (runs against live Electron app via CDP)

**Styling:**
- `src/styles/global.css`: Theme variables (Catppuccin dark), base resets
- `src/App.css`: App header, nav button styles
- `src/components/*/[Component].css`: Component-scoped styles

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `GraphView.tsx`, `CodePreview.tsx`)
- Stores: `camelCase.ts` (e.g., `appStore.ts`)
- CSS: Matches component name `PascalCase.css` (e.g., `GraphView.css`)
- Types/interfaces: `camelCase.ts` (e.g., `model.ts`, `global.d.ts`)
- Barrel exports: `index.ts`
- Plugin implementations: `PascalCase.ts` (e.g., `VsBrowseDbPlugin.ts`, `PluginManager.ts`)

**Directories:**
- Components: `PascalCase/` matching component name (e.g., `GraphView/`, `CodePreview/`)
- Other directories: `kebab-case` or `camelCase` (e.g., `vs-browse-db/`, `stores/`)

**Exports:**
- Components: Named exports (e.g., `export function GraphView()`)
- Store: Named export `export const useAppStore = create<AppState>(...)`
- API functions: Named exports (e.g., `export async function getClasses()`)
- Plugin classes: Named exports (e.g., `export class VsBrowseDbPlugin`)
- Types: Named exports (e.g., `export interface CodeSymbol`, `export enum SymbolKind`)

**CSS Classes:**
- BEM-lite with kebab-case: `.graph-view`, `.class-node`, `.expanded-class-node`, `.member-item`
- State modifiers: `.selected`, `.active`, `.pinned`, `.inherited`, `.highlighted`
- Kind variants: `.kind-class`, `.kind-struct`, `.kind-member_function`

## Where to Add New Code

**New Plugin (data source):**
- Create directory: `plugins/{plugin-name}/`
- Implement `CodeAnalysisPlugin` interface from `plugins/core/types.ts`
- Export from `plugins/{plugin-name}/index.ts`
- Register in `electron/main.ts`: `pluginManager.register(new YourPlugin())`
- No changes needed to IPC handlers or renderer — the `PluginManager` proxy handles routing

**New UI Component:**
- Create directory: `src/components/{ComponentName}/`
- Create `{ComponentName}.tsx` + `{ComponentName}.css`
- Use `useAppStore()` hook to access state
- Import and mount in parent component (typically `Layout.tsx` or `App.tsx`)

**New IPC Channel:**
1. Add channel name to `IPC_CHANNELS` in `src/types/model.ts`
2. Add handler in `electron/ipc/handlers.ts` via `ipcMain.handle()`
3. Add bridge method in `electron/preload.ts`
4. Add wrapper function in `src/api/index.ts`
5. Add store action in `src/stores/appStore.ts` if needed

**New Store State/Action:**
- Add to `AppState` interface in `src/stores/appStore.ts`
- Add initial value and action implementation in the `create()` call
- Consume in components via `useAppStore()`

**New Shared Type:**
- Add to `src/types/model.ts` — this file is imported by both main and renderer

**New Plugin Method:**
1. Add to `CodeAnalysisPlugin` interface in `plugins/core/types.ts` (use `?` for optional methods)
2. Add proxy method in `plugins/core/PluginManager.ts`
3. Implement in concrete plugin (e.g., `plugins/vs-browse-db/VsBrowseDbPlugin.ts`)
4. Wire through IPC (channel, handler, preload, API wrapper) as described above

**Utilities/Helpers:**
- Main-process utilities: Add to `electron/` or `plugins/` depending on scope
- Renderer utilities: Create `src/utils/` directory if needed (does not exist yet)
- Shared utilities: Place alongside types in `src/types/` or create `src/shared/`

## Special Directories

**`out/`:**
- Purpose: Build output from electron-vite
- Generated: Yes (by `npm run build`)
- Committed: No (in `.gitignore`)
- Structure: `out/main/`, `out/preload/`, `out/renderer/`

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)

**`test-screenshots/`:**
- Purpose: Screenshots captured during E2E test runs
- Generated: Yes (by `test-electron.mjs`)
- Committed: No (in `.gitignore`)

**`.planning/`:**
- Purpose: GSD workflow planning documents and codebase analysis
- Generated: Partially (analysis docs generated by GSD commands)
- Committed: Yes (based on `config.json` `commit_docs: true`)

**`.github/`:**
- Purpose: OpenSpec AI prompts and skills for spec-driven development
- Generated: No
- Committed: Yes
- Contains: `prompts/` (4 prompt templates), `skills/` (4 skill directories)

**`openspec/`:**
- Purpose: OpenSpec schema configuration
- Generated: No
- Committed: Yes
- Contains: `config.yaml` (minimal, mostly placeholder)

---

*Structure analysis: 2026-03-17*
