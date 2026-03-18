# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- Components: `PascalCase.tsx` matching the component name (e.g., `GraphView.tsx`, `SearchBar.tsx`)
- Component CSS: co-located `PascalCase.css` matching the component name (e.g., `GraphView.css`)
- Stores: `camelCase.ts` (e.g., `appStore.ts`)
- Types/Models: `camelCase.ts` (e.g., `model.ts`, `types.ts`)
- Barrel exports: `index.ts` for plugin modules
- Electron process files: `camelCase.ts` (e.g., `main.ts`, `preload.ts`, `handlers.ts`)

**Directories:**
- Components: `PascalCase/` matching the component name (e.g., `GraphView/`, `SearchBar/`)
- Non-component directories: `camelCase` (e.g., `stores/`, `types/`, `api/`, `ipc/`)
- Plugin directories: `kebab-case` (e.g., `vs-browse-db/`, `core/`)

**Functions:**
- React components: `PascalCase` function declarations (e.g., `function GraphView()`, `function MainLayout()`)
- Event handlers: `handleX` prefix (e.g., `handleChange`, `handleSelect`, `handleOpenDb`, `handleMemberClick`)
- Store actions: `camelCase` verbs (e.g., `loadClasses`, `selectClass`, `openDatabase`, `goBack`)
- Helper/utility: `camelCase` (e.g., `mapKind`, `resolveFile`, `buildFlowElements`)
- Plugin interface methods: `camelCase` verbs (e.g., `initialize`, `dispose`, `isReady`, `getClasses`)

**Variables:**
- Local state: `camelCase` (e.g., `memberFilter`, `showResults`, `debounceRef`)
- Constants: `UPPER_SNAKE_CASE` for shared channel names and static maps (e.g., `IPC_CHANNELS`, `KIND_MAP`, `PRIMITIVE_TYPES`)
- CSS custom properties: `--kebab-case` with category prefix (e.g., `--bg-primary`, `--text-accent`, `--color-class`)
- Layout constants inside functions: `UPPER_SNAKE_CASE` (e.g., `HORIZONTAL_GAP`, `VERTICAL_GAP`, `TYPE_X_OFFSET`)

**Types/Interfaces:**
- Interfaces: `PascalCase` (e.g., `AppState`, `CodeSymbol`, `PluginConfig`, `ClassNodeData`)
- Enums: `PascalCase` with `PascalCase` members (e.g., `SymbolKind.MemberFunction`, `EdgeKind.UsesType`)
- Type aliases: `PascalCase` (e.g., `SortKey`, `GroupMode`, `TelepathyAPI`)
- DB row types (internal): `PascalCase` with `Row` suffix (e.g., `CodeItemRow`, `FileRow`, `BaseClassRow`)

## Code Style

**Formatting:**
- No Prettier or ESLint config detected — formatting is manual/IDE-driven
- Indentation: 2 spaces throughout
- Semicolons: omitted (no-semicolon style)
- Quotes: single quotes for strings
- Trailing commas: used in multi-line objects, arrays, and function parameters
- Line length: no enforced limit, but lines generally stay under ~120 characters
- Blank lines: single blank line between logical sections

**TypeScript:**
- `strict: true` in `tsconfig.json`
- `type` keyword for import-only types: `import type { CodeSymbol } from '...'`
- Mixed value+type imports use inline `type` keyword: `import { SymbolKind, type CodeSymbol } from '...'`
- Non-null assertions used sparingly for DB handle: `this.db!`
- Type assertions for DB query results: `as CodeItemRow[]`, `as CodeItemRow | undefined`
- `as const` for IPC channel objects to preserve literal types

## File Headers

Every source file uses a standardized block-comment header:

```typescript
// ============================================================
// Telepathy - [Module Description]
// [Optional second line with more detail]
// ============================================================
```

Use this header for all new files. The separator line is 60 `=` characters.

## Import Organization

**Order:**
1. External packages (React, Electron, third-party libs)
2. Internal absolute imports (from other project directories)
3. Relative imports (local files)
4. Style imports (CSS files — always last)

**Example from `GraphView.tsx`:**
```typescript
import { useMemo, useCallback } from 'react'
import { ReactFlow, Background, Controls, ... } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAppStore } from '../../stores/appStore'
import { EdgeKind, SymbolKind } from '../../types/model'
import type { CodeGraph, CodeSymbol } from '../../types/model'
import './GraphView.css'
```

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json` and `electron.vite.config.ts`)
- Currently not used in source files — all imports use relative paths (`../../stores/appStore`)
- New code may use either relative paths or `@/` alias for renderer-side imports

## React Patterns

**Component Declaration:**
- Use `function` declarations (not arrow functions) for top-level components:
  ```typescript
  export function GraphView() { ... }
  ```
- Use `forwardRef` with arrow functions for components needing refs:
  ```typescript
  const SourceCodeView = forwardRef<HTMLPreElement, Props>(({ code, highlightLine }, ref) => { ... })
  SourceCodeView.displayName = 'SourceCodeView'
  ```
- Internal sub-components (non-exported) also use `function` declarations:
  ```typescript
  function MemberItem({ member, isActive, isSelected, onClick }: Props) { ... }
  ```

**Props:**
- Define props inline at the function parameter, not as separate interfaces, for simple sub-components:
  ```typescript
  function SymbolTreeItem({ symbol, isSelected, onClick }: {
    symbol: SymbolSummary
    isSelected: boolean
    onClick: () => void
  }) { ... }
  ```
- Use named interfaces for complex node data types consumed by libraries:
  ```typescript
  interface ClassNodeData { label: string; kind: SymbolKind; ... }
  ```

**State Management:**
- Global state: Zustand store in `src/stores/appStore.ts`
- Local UI state: `useState` hooks (e.g., filter text, sort mode, dropdown visibility)
- Access store with: `const { ... } = useAppStore()`
- Access store outside React (in node handlers): `useAppStore.getState()`

**Hooks:**
- `useCallback` for event handlers passed to child components or stored refs
- `useMemo` for expensive computations (graph layout, member filtering/sorting)
- `useEffect` for side effects (keyboard listeners, scroll-to-line, filter reset on class change)
- `useRef` for DOM refs and mutable values (debounce timers, input elements)

**Component Structure:**
- Each component lives in its own directory: `src/components/ComponentName/`
- Directory contains exactly 2 files: `ComponentName.tsx` and `ComponentName.css`
- Sub-components (e.g., `MemberItem`, `SymbolTreeItem`) live in the same file as their parent component
- No barrel `index.ts` files in component directories — import the component file directly

## Error Handling

**Patterns:**

**Store actions (async):** try/catch with `console.error` and state reset:
```typescript
openDatabase: async (dbPath: string) => {
  try {
    await api.initPlugin('vs-browse-db', dbPath)
    set({ isConnected: true, dbPath })
    await get().loadClasses()
  } catch (err) {
    console.error('Failed to open database:', err)
    throw err  // re-throw for callers that need to know
  }
},
```

**Store actions (non-critical):** catch, log, reset loading state, do NOT re-throw:
```typescript
loadClasses: async (filter?: string) => {
  set({ isLoadingClasses: true })
  try {
    const classes = await api.getClasses(filter)
    set({ classes, isLoadingClasses: false })
  } catch (err) {
    console.error('Failed to load classes:', err)
    set({ isLoadingClasses: false })
  }
},
```

**Plugin layer:** throw descriptive `Error` with context:
```typescript
if (!plugin) {
  throw new Error(`Plugin not found: ${pluginName}`)
}
throw new Error('No active plugin. Open a data source first.')
```

**File I/O (plugin):** return user-friendly fallback on error:
```typescript
} catch (err) {
  return `// Error reading file: ${(err as Error).message}`
}
```

**General rules:**
- Use `(err as Error).message` for error message access (no `unknown` typing)
- Loading states (`isLoadingX`) are always reset in both try and catch branches
- Critical errors (database open) re-throw; non-critical (load classes, source) silently degrade
- No custom error classes — all errors are plain `Error` instances
- No global error boundary in the React tree

## Logging

**Framework:** `console.log` and `console.error` (no logging library)

**Patterns:**
- Plugin manager: `[PluginManager]` prefix: `console.log('[PluginManager] Registered plugin: ...')`
- Plugin implementation: `[VsBrowseDbPlugin]` prefix: `console.log('[VsBrowseDbPlugin] Opened: ...')`
- Store actions: descriptive prefix: `console.error('Failed to load classes:', err)`
- Use bracket-prefix tags for main-process logging: `[ModuleName]`

## CSS Patterns

**Architecture:**
- CSS custom properties (variables) defined in `src/styles/global.css` on `:root`
- Component-scoped CSS in co-located `.css` files (no CSS modules, no CSS-in-JS)
- Class names use `kebab-case` (e.g., `graph-member-row`, `member-group-header`)
- BEM-like but not strict BEM — uses `component-element` pattern (e.g., `class-node-header`, `expanded-section`)
- State classes: `active`, `selected`, `pinned`, `inherited`, `highlighted`
- Kind-based classes: `kind-class`, `kind-struct`, `kind-${member.kind}`

**Color Theme:**
- All colors referenced through CSS variables — never hardcoded
- Dark theme (Catppuccin Mocha-inspired): `--bg-primary: #1e1e2e`
- Semantic color naming: `--color-class`, `--color-function`, `--color-inherit-edge`

## Module Design

**Exports:**
- Named exports only — no default exports anywhere in the codebase
- Components: `export function ComponentName() { ... }`
- Stores: `export const useAppStore = create<AppState>(...)`
- Plugins: barrel `index.ts` re-exports types and implementations

**Barrel Files:**
- Used in plugin modules only: `plugins/core/index.ts`, `plugins/vs-browse-db/index.ts`
- NOT used in `src/components/` — import component files directly
- Pattern: `export { ClassName } from './ClassName'` and `export type { TypeName } from './types'`

## IPC Communication

**Channel naming:** `category:action` format using constants from `src/types/model.ts`:
```typescript
export const IPC_CHANNELS = {
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_INIT: 'plugin:init',
  GET_CLASSES: 'query:classes',
  OPEN_DB_DIALOG: 'dialog:open-db',
} as const
```

**Pattern:** All IPC uses `invoke`/`handle` (request-response), no `send`/`on` (fire-and-forget).

**Layers:**
1. Renderer calls `window.telepathy.methodName()` (from `src/api/index.ts`)
2. Preload bridges via `ipcRenderer.invoke(IPC_CHANNELS.X, ...)` (from `electron/preload.ts`)
3. Main process handles via `ipcMain.handle(IPC_CHANNELS.X, ...)` (from `electron/ipc/handlers.ts`)
4. Handler delegates to `PluginManager` which routes to active plugin

## Plugin Architecture

**Interface contract:** All plugins implement `CodeAnalysisPlugin` from `plugins/core/types.ts`:
```typescript
export interface CodeAnalysisPlugin {
  readonly info: PluginInfo
  initialize(config: PluginConfig): Promise<void>
  dispose(): Promise<void>
  isReady(): boolean
  getClasses(filter?: string): Promise<SymbolSummary[]>
  getClassDetail(classId: string): Promise<CodeSymbol | null>
  getClassHierarchy(classId: string): Promise<CodeGraph>
  getCallGraph?(symbolId: string, depth?: number): Promise<CodeGraph>  // optional
  searchSymbols(query: string, kinds?: SymbolKind[], limit?: number): Promise<SymbolSummary[]>
  getSourceSnippet(file: string, line: number, contextLines?: number): Promise<string>
}
```

**Registration:** Plugins are registered in `electron/main.ts` at startup:
```typescript
pluginManager.register(new VsBrowseDbPlugin())
```

**Data types:** All plugins return unified types from `src/types/model.ts` — never raw DB types.

## Comments

**When to Comment:**
- Section separators within files: `// ---- Section Name ----`
- Complex SQL queries: brief explanation above the statement
- Non-obvious algorithmic choices: inline comments explaining "why"
- TODO items: `// TODO: description` (sparingly — only 1 exists)

**JSDoc/TSDoc:**
- Used on plugin interface methods in `plugins/core/types.ts`
- Used on complex private methods in plugin implementations
- NOT used on React components, store actions, or simple helpers
- Format: `/** Single-line doc */` for brief descriptions

---

*Convention analysis: 2026-03-17*
