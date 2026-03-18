# Codebase Concerns

**Analysis Date:** 2026-03-17

## Tech Debt

**Missing Qualified Names (TODO in code):**
- Issue: `qualifiedName` is always set to `row.name` — never built from the parent chain (e.g. `ns::Class::method`). An explicit `TODO` comment acknowledges this.
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 351, 363)
- Impact: Search results and tooltips show bare names instead of namespace-qualified names, making it impossible to distinguish between identically-named symbols in different namespaces.
- Fix approach: Walk `parent_id` chain upward (caching results), concatenate with `::` separator to produce qualified names.

**Duplicated `kindLabels` Constant:**
- Issue: The `kindLabels` record mapping `SymbolKind` to display strings (`fn`, `var`, `enum`, etc.) is duplicated identically in two components.
- Files: `src/components/GraphView/GraphView.tsx` (line 69), `src/components/CodePreview/CodePreview.tsx` (line 270)
- Impact: Changes to display labels must be made in two places. Easy to get out of sync.
- Fix approach: Extract into a shared module under `src/types/` or `src/utils/` and import from both components.

**Triplicated Class-Loading Logic in Store:**
- Issue: `selectClass`, `goBack`, and `goForward` all contain the same pattern: set loading flags → `Promise.all([getClassDetail, getClassHierarchy])` → set results → `loadSource`. The three copies span ~40 lines each.
- Files: `src/stores/appStore.ts` (lines 111–141, 202–228, 231–258)
- Impact: Any change to the class-loading flow (e.g. adding error toasts, caching, optimistic updates) must be replicated in three places.
- Fix approach: Extract a private `loadClassById(classId: string)` helper and call it from all three actions.

**`as any` Type Assertions in Plugin:**
- Issue: Base class query results are typed as `any[]` instead of a proper interface, losing type safety.
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 429, 490)
- Impact: Property access on these rows has no compile-time checking — typos or schema changes will only surface at runtime.
- Fix approach: Define a `BaseClassQueryRow` interface with `base_code_item_id`, `parent_code_item_id`, `base_name`, and `base_class_id` fields; use it as the generic type for `.all()`.

**`sandbox: false` in Electron:**
- Issue: The renderer process runs with `sandbox: false`, which weakens the Electron security model.
- Files: `electron/main.ts` (line 24)
- Impact: If a vulnerability allows script injection in the renderer, the attacker gets broader access to Node.js APIs via the preload script's execution environment.
- Fix approach: Evaluate whether the preload script actually needs un-sandboxed access. Since `better-sqlite3` runs only in the main process via IPC, sandboxing the renderer should be possible. Set `sandbox: true` and test.

**NUL File in Repository Root:**
- Issue: A file literally named `NUL` exists at the project root (tracked by git as untracked). This is a Windows artifact created when a command redirected output to `nul` — on Windows this creates a literal file.
- Files: `NUL` (project root)
- Impact: Confusing to collaborators; should not be committed. Already in `.gitignore` patterns won't catch this since it's not a standard ignore pattern.
- Fix approach: Delete the file. Add `NUL` to `.gitignore` to prevent recurrence.

## Known Bugs

**Class Filter Has No Debounce:**
- Symptoms: Every keystroke in the class filter input triggers `setClassFilter` → `loadClasses(filter)` which issues a synchronous SQLite query via IPC round-trip. With fast typing, many redundant IPC calls fire.
- Files: `src/stores/appStore.ts` (lines 197–199), `src/components/SymbolTree/SymbolTree.tsx` (line 51)
- Trigger: Type quickly into the "Filter classes..." input.
- Workaround: SQLite queries are fast (~ms), so impact is tolerable for now. The search bar (`SearchBar.tsx`) correctly debounces with 200ms timeout — the class filter should match.

**Search Results Only Navigate to Classes/Structs:**
- Symptoms: Clicking a search result for a function, member, enum, or namespace does nothing — `handleSelect` only calls `selectClass` for Class/Struct kinds.
- Files: `src/components/SearchBar/SearchBar.tsx` (lines 40–45)
- Trigger: Search for a function name, click the result.
- Workaround: None. Users must manually find the symbol via the class tree.

**`useMemo` Used for Side Effects in GraphView:**
- Symptoms: `useMemo` is called to synchronize nodes/edges state via `setNodes`/`setEdges`, which is a side effect. React explicitly warns against this — `useMemo` is for pure computations. In React StrictMode (which is enabled), this could fire twice.
- Files: `src/components/GraphView/GraphView.tsx` (lines 343–346)
- Trigger: Any graph data change.
- Workaround: Functionally works because `setNodes`/`setEdges` are idempotent. Should be converted to `useEffect`.

## Security Considerations

**Arbitrary File Read via `getSourceSnippet`:**
- Risk: The `getSourceSnippet` IPC handler accepts any file path from the renderer and reads it with `fs.readFileSync`. There is no validation that the path is within the project or database scope.
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 571–592), `electron/ipc/handlers.ts` (line 40)
- Current mitigation: `contextIsolation: true` and `nodeIntegration: false` prevent direct Node.js access from the renderer. The attack surface requires compromising the preload bridge.
- Recommendations: Add path validation — restrict reads to paths that exist in the database's `files` table or within the database's parent directory tree.

**Hardcoded Test Database Path:**
- Risk: The E2E test file contains a hardcoded absolute path to a developer's local database. Not a security vulnerability per se, but exposes internal filesystem structure.
- Files: `test-electron.mjs` (line 5: `D:/src/engine2/Sql/Picasso/Engine/src/.vs/server/v18/Browse.VC.db`)
- Current mitigation: Test file is committed to the repo but only runs manually.
- Recommendations: Accept the database path as an environment variable or CLI argument. Default to a test fixture if available.

**Exposed Store on `window` Object:**
- Risk: `window.__telepathyStore` exposes the full Zustand store (including `openDatabase`) to any code running in the renderer, including potential XSS payloads.
- Files: `src/stores/appStore.ts` (lines 262–264)
- Current mitigation: This is intentionally for E2E testing. The renderer is a local Electron app, not a public web page.
- Recommendations: Gate behind `process.env.NODE_ENV === 'development'` or an explicit test flag so it's stripped in production builds.

## Performance Bottlenecks

**No List Virtualization for Class Tree (up to 5000 items):**
- Problem: The `stmtGetClasses` query has a `LIMIT 5000`. All 5000 `<div>` elements are rendered into the DOM at once in `SymbolTree`.
- Files: `src/components/SymbolTree/SymbolTree.tsx` (lines 62–69), `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (line 156)
- Cause: No windowing/virtualization library is used. React renders all items.
- Improvement path: Use `react-window` or `@tanstack/virtual` to virtualize the list. Only render visible items (~30–50 rows).

**No List Virtualization for Member List:**
- Problem: Classes can have hundreds of members (including inherited). All are rendered as DOM nodes.
- Files: `src/components/CodePreview/CodePreview.tsx` (lines 157–186)
- Cause: Same as above — no virtualization.
- Improvement path: Virtualize the member list. Less urgent than the class tree since member counts are typically lower.

**Correlated Subqueries in Class Listing SQL:**
- Problem: `stmtGetClasses` uses two correlated subqueries per row — `SELECT COUNT(*)` in both the SELECT and WHERE clauses. On databases with many code_items, this is O(n×m).
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 147–157)
- Cause: SQLite's query planner handles this reasonably with the B-tree index on `parent_id`, but it's still suboptimal.
- Improvement path: Use a single `JOIN` with `GROUP BY` or a CTE to compute member counts once. Alternatively, add an index on `code_items(parent_id, kind)` if the database allows it (currently opened read-only).

**`readFileSync` for Source Snippets:**
- Problem: Source files are read synchronously, blocking the main process thread while serving the IPC request.
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (line 579)
- Cause: Using `fs.readFileSync` instead of `fs.promises.readFile`.
- Improvement path: Switch to async `fs.promises.readFile`. Consider caching recently read files since users often navigate between members in the same file.

## Fragile Areas

**GraphView Layout Calculation:**
- Files: `src/components/GraphView/GraphView.tsx` (lines 168–327, `buildFlowElements`)
- Why fragile: The layout is manually calculated with hardcoded `HORIZONTAL_GAP`, `VERTICAL_GAP`, and `TYPE_X_OFFSET` constants. Node heights are estimated from member counts (`60 + memberRows * 24 + 40`). Any CSS change to node padding, font size, or member row height will cause layout misalignment without any visible error.
- Safe modification: If changing CSS for `.expanded-class-node` or `.graph-member-row`, recalculate the height estimate in `buildFlowElements`. Consider using `@xyflow/react`'s auto-layout or dagre/elkjs for proper graph layout.
- Test coverage: No automated tests for layout correctness.

**Type Resolution Heuristic:**
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 298–327, `resolveTypeToClassId`)
- Why fragile: Parses C++ type strings with regex to extract identifiable type names. Relies on hardcoded `PRIMITIVE_TYPES` and `SKIP_TOKENS` sets that may not cover all cases (e.g., project-specific typedefs, template metaprogramming types). The resolution tries the last segment of namespace-qualified names first, which could match the wrong type in ambiguous cases.
- Safe modification: Add new entries to `PRIMITIVE_TYPES` or `SKIP_TOKENS` as needed. Avoid changing the token extraction regex without thorough testing against real Browse.VC.db data.
- Test coverage: No unit tests for type resolution.

**Forward Declaration Deduplication:**
- Files: `plugins/vs-browse-db/VsBrowseDbPlugin.ts` (lines 147–168 class queries, lines 189–224 base/derived queries)
- Why fragile: The "prefer definition over forward declaration" logic relies on `GROUP BY name, kind` with `MAX(member_count)` to select the definition. This works because forward decls have 0 members. If a DB contains multiple definitions (e.g., partial classes or template specializations), the heuristic may pick the wrong one.
- Safe modification: Test changes against databases with complex template hierarchies.
- Test coverage: No automated tests for deduplication correctness.

## Scaling Limits

**5000 Class Hard Limit:**
- Current capacity: `LIMIT 5000` in class queries.
- Limit: Large C++ codebases (e.g., Chromium, Unreal Engine) can have 50,000+ classes.
- Scaling path: Implement pagination or virtual scrolling + lazy loading. Remove the LIMIT and rely on UI virtualization to handle rendering.

**Single Active Plugin:**
- Current capacity: `PluginManager` supports only one active plugin at a time.
- Limit: Cannot cross-reference symbols across multiple databases or projects simultaneously.
- Scaling path: Allow multiple active plugins with a routing layer that queries all active plugins and merges results.

**File Cache Loaded Entirely at Init:**
- Current capacity: All file paths from the `files` table are cached in memory.
- Limit: Very large databases could have 100K+ file entries, each consuming ~200 bytes → ~20MB.
- Scaling path: Use an LRU cache or keep the file lookup as a prepared statement.

## Dependencies at Risk

**`better-sqlite3` + Electron Rebuild:**
- Risk: Native module requires `electron-rebuild` on every Electron upgrade. Version mismatches cause cryptic NAPI errors at runtime.
- Impact: Blocks Electron upgrades; CI must rebuild native modules per platform.
- Migration plan: For read-only use cases, consider `sql.js` (WASM-based SQLite) which requires no native rebuild. Trade-off: slightly slower queries.

**`@xyflow/react` (v12):**
- Risk: Major version changes in React Flow have historically been breaking. The codebase uses custom node types (`classNode`, `expandedClassNode`) which are API-surface-sensitive.
- Impact: Upgrading may require rewriting node components and layout logic.
- Migration plan: Pin version. Review changelogs carefully before upgrading.

## Missing Critical Features

**No Error UI / Toast System:**
- Problem: All errors are caught and logged to `console.error`. The user sees no feedback when operations fail (e.g., database open fails, file not found, IPC error).
- Blocks: User experience — silent failures are confusing.
- Files: `src/stores/appStore.ts` (every catch block)

**No Call Graph Support:**
- Problem: The `CodeAnalysisPlugin` interface defines `getCallGraph` as optional, but it is not implemented in `VsBrowseDbPlugin`. The IPC channel `GET_CALL_GRAPH` exists in `model.ts` but has no handler registered.
- Blocks: A core visualization feature — understanding which functions call which.
- Files: `plugins/core/types.ts` (line 48), `src/types/model.ts` (line 93), `electron/ipc/handlers.ts` (no handler)

**No Persistence of UI State:**
- Problem: Opening the app always starts from scratch. No recently-opened databases, no last-selected class, no window size memory.
- Blocks: Workflow continuity between sessions.

## Test Coverage Gaps

**Zero Unit Tests:**
- What's not tested: There are no `*.test.*` or `*.spec.*` files anywhere in the codebase. Zero unit test coverage.
- Files: Entire codebase — `src/`, `electron/`, `plugins/`
- Risk: Any refactoring (especially to SQL queries, type resolution, or store logic) could break functionality with no automated detection.
- Priority: **High** — the type resolution logic (`resolveTypeToClassId`), SQL query results mapping, and store actions are the highest-value targets for unit tests.

**E2E Test is Manual and Environment-Specific:**
- What's not tested: The single E2E test (`test-electron.mjs`) requires a running Electron instance with CDP on port 9222, and a specific local database file. It cannot run in CI.
- Files: `test-electron.mjs`
- Risk: Regression detection depends entirely on manual testing.
- Priority: **Medium** — parameterize the DB path, add a small test fixture database, and integrate into a CI workflow.

**No Test Configuration:**
- What's not tested: No test runner is configured. No `jest.config.*`, `vitest.config.*`, or test scripts in `package.json`.
- Files: `package.json` (lines 6–11 — no test script)
- Risk: Contributors have no guidance on how to write or run tests.
- Priority: **High** — set up vitest (already using Vite) with a basic config and at least one example test.

---

*Concerns audit: 2026-03-17*
