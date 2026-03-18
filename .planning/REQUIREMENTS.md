# Requirements: Telepathy

**Defined:** 2026-03-17
**Core Value:** Rapidly navigate and understand C++ codebases by visually exploring class relationships and pinning important symbols into a persistent, connected graph.

## v1 Requirements

Requirements for this round of work. Each maps to roadmap phases.

### Search Performance

- [ ] **SRCH-01**: Typing in the SymbolTree filter does not freeze or lag the UI
- [ ] **SRCH-02**: Filter input is debounced (200-300ms) before triggering IPC/SQL queries
- [ ] **SRCH-03**: Rapid typing cancels stale in-flight queries (no race conditions)

### Class Pinning

- [ ] **CPIN-01**: User can pin/unpin a class from the SymbolTree list or graph node
- [ ] **CPIN-02**: Pinned classes persist across class navigation (not cleared on selectClass)
- [ ] **CPIN-03**: Pinned classes are visually indicated in the SymbolTree list
- [ ] **CPIN-04**: User can clear all pinned classes with a single action

### Multi-Class Graph

- [ ] **GRAP-01**: All pinned classes appear simultaneously in the GraphView
- [ ] **GRAP-02**: Connections (inheritance, type-reference) between pinned classes are drawn
- [ ] **GRAP-03**: Each pinned class shows as an expandable node with its members
- [ ] **GRAP-04**: Disconnected pinned groups render as separate visual islands with clear spacing
- [ ] **GRAP-05**: The currently selected class is visually distinguished from other pinned classes
- [ ] **GRAP-06**: Clicking a pinned class node in the graph selects it (loads members + source)
- [ ] **GRAP-07**: Graph layout handles 2-10 pinned classes without overlapping nodes

### State Persistence

- [ ] **SAVE-01**: User can save current pinned state (classes + members) to a JSON file via File dialog
- [ ] **SAVE-02**: User can load a previously saved JSON file to restore all pinned classes/members
- [ ] **SAVE-03**: Save file includes DB path reference so user knows which DB it belongs to
- [ ] **SAVE-04**: Loading a save file for the wrong DB shows a clear warning
- [ ] **SAVE-05**: Save/load accessible via keyboard shortcut (Ctrl+S / Ctrl+O) or UI button

### Syntax Highlighting

- [ ] **SYNT-01**: Source code preview renders with syntax-highlighted C/C++ code
- [ ] **SYNT-02**: Highlighting uses Shiki with a dark theme matching the app's color scheme
- [ ] **SYNT-03**: Line numbers remain visible and aligned alongside highlighted code
- [ ] **SYNT-04**: The active/highlighted line retains its visual emphasis over syntax colors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Search Enhancements

- **SRCH-10**: Fuzzy search using fuse.js for approximate matching
- **SRCH-11**: Search across all symbol kinds (not just classes/structs)
- **SRCH-12**: Search result ranking by relevance

### Graph Enhancements

- **GRAP-10**: Force-directed or dagre/elk auto-layout for complex graphs
- **GRAP-11**: Multi-level hierarchy traversal (grandparent/grandchild)
- **GRAP-12**: Call graph visualization between methods
- **GRAP-13**: Manual node dragging with position persistence

### Code Preview Enhancements

- **SYNT-10**: Full file view with scrolling (not just context window)
- **SYNT-11**: Click-to-navigate from source lines to symbol definitions
- **SYNT-12**: Copy-to-clipboard for code snippets

### Persistence Enhancements

- **SAVE-10**: Auto-save last opened DB path and restore on launch
- **SAVE-11**: Recent files list
- **SAVE-12**: Remember panel sizes across sessions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-DB pinning | Keeps state management simple, single DB context |
| New data source plugins | Future work after core UX is solid |
| Unit test framework | Not in this round, but Vitest is recommended for future |
| OAuth/auth system | Personal tool, no auth needed |
| Mobile/web version | Desktop only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRCH-01 | Phase 1 | Pending |
| SRCH-02 | Phase 1 | Pending |
| SRCH-03 | Phase 1 | Pending |
| SYNT-01 | Phase 2 | Pending |
| SYNT-02 | Phase 2 | Pending |
| SYNT-03 | Phase 2 | Pending |
| SYNT-04 | Phase 2 | Pending |
| CPIN-01 | Phase 3 | Pending |
| CPIN-02 | Phase 3 | Pending |
| CPIN-03 | Phase 3 | Pending |
| CPIN-04 | Phase 3 | Pending |
| GRAP-01 | Phase 3 | Pending |
| GRAP-02 | Phase 3 | Pending |
| GRAP-03 | Phase 3 | Pending |
| GRAP-04 | Phase 3 | Pending |
| GRAP-05 | Phase 3 | Pending |
| GRAP-06 | Phase 3 | Pending |
| GRAP-07 | Phase 3 | Pending |
| SAVE-01 | Phase 4 | Pending |
| SAVE-02 | Phase 4 | Pending |
| SAVE-03 | Phase 4 | Pending |
| SAVE-04 | Phase 4 | Pending |
| SAVE-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*
