# Telepathy

## What This Is

A desktop code visualization tool (Sourcetrail-like) built with Electron + React that reads Visual Studio's Browse.VC.db to visualize C++ class hierarchies, member relationships, and source code. Personal tool with future open-source aspirations.

## Core Value

Rapidly navigate and understand C++ codebases by visually exploring class relationships and pinning important symbols into a persistent, connected graph.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- [x] Open a Browse.VC.db file and browse indexed classes/structs
- [x] View class hierarchy (base/derived) as a graph
- [x] Select members to see type-reference edges in the graph
- [x] Preview source code for selected classes and members
- [x] Pin individual members (Ctrl+Click) to filter graph display
- [x] Navigate class history (back/forward)
- [x] Filter classes in the left panel
- [x] Global symbol search (SearchBar with debounce)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Async/debounced class filter — typing in SymbolTree must not freeze the UI
- [ ] Pin classes — ability to pin entire classes, not just members
- [ ] Multi-class graph — pinned classes all visible simultaneously with their connections
- [ ] Island layout — disconnected pinned groups rendered as separate visual clusters
- [ ] Save pinned state — export current pinned classes/members to a JSON file
- [ ] Load pinned state — import a previously saved JSON file to restore pins
- [ ] Syntax highlighting — source code preview with Shiki-based C/C++ highlighting

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Cross-DB pinning (pinning classes from different .db files) — keep it simple, single DB context
- New data source plugins (clangd, ctags, LSP) — future work after core UX is solid
- Multi-level hierarchy traversal (grandparents/grandchildren in graph) — not requested, add later if needed
- Call graph visualization — `getCallGraph` exists in plugin interface but deferred
- Full file view in CodePreview — current context window (61 lines) is sufficient for now
- Mobile/web version — desktop only
- Zustand session persistence (auto-save last DB, panel sizes) — nice-to-have but not in this round

## Context

- **Codebase**: ~4,500 LOC across Electron main process, React renderer, and one plugin
- **Plugin system**: `CodeAnalysisPlugin` interface, currently only `vs-browse-db` plugin
- **State**: Single flat Zustand store, no persistence middleware
- **Graph library**: @xyflow/react with manual static layout (no force-directed/dagre)
- **Search**: `fuse.js` is a dependency but never used — was likely planned for fuzzy search
- **Testing**: Only CDP-based E2E via Playwright, no unit tests
- **Known issues**: SymbolTree filter fires IPC+SQL on every keystroke (no debounce), `useMemo` with side effects in GraphView, pins cleared on class navigation

## Constraints

- **Tech stack**: Electron 41 + React 19 + TypeScript, must stay within existing stack
- **Data source**: Read-only access to Browse.VC.db via better-sqlite3
- **Bundle size**: Shiki adds ~2MB — acceptable for Electron app
- **Layout**: Current 3-pane layout (SymbolTree | GraphView | CodePreview) preserved

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shiki for syntax highlighting | VS Code-quality C/C++ tokenization, good bundle size for Electron | -- Pending |
| JSON for save/load format | Simple, human-readable, no custom parser needed | -- Pending |
| Same-DB multi-class pinning only | Keeps state management simple, single plugin context | -- Pending |
| Personal-first, OSS later | Skip polish/docs overhead for now, focus on functionality | -- Pending |

---
*Last updated: 2026-03-17 after initial project definition*
