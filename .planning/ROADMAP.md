# Roadmap: Telepathy

**Created:** 2026-03-17
**Core Value:** Rapidly navigate and understand C++ codebases by visually exploring class relationships and pinning important symbols into a persistent, connected graph.

## Overview

4 phases delivering 5 features in dependency order. Phases 1 and 2 are independent quick wins; Phase 3 is the core architectural change; Phase 4 builds on Phase 3.

```
Phase 1: Search Performance ──┐
Phase 2: Syntax Highlighting ─┼──► Phase 3: Class Pinning + Graph ──► Phase 4: Save/Load
                               │
                        (independent)
```

## Phase 1: Search Performance

**Goal:** Typing in the SymbolTree filter is responsive — no UI freezes, no stale results.

**Requirements:** SRCH-01, SRCH-02, SRCH-03

**Key deliverables:**
- Debounced filter input (200-300ms) in SymbolTree
- Request-ID guard to prevent stale IPC responses from overwriting newer results
- Optional: replace IPC-based SQL filtering with client-side fuse.js for instant results

**Key files to modify:**
- `src/stores/appStore.ts` — `setClassFilter`, `loadClasses`
- `src/components/SymbolTree/SymbolTree.tsx` — filter input
- `src/api/index.ts` — `getClasses` wrapper (if adding request-ID)

**Estimated effort:** Small (1-2 hours)

**Success criteria:**
- Typing "mdcontext" character by character produces zero UI freezes
- Only the final filter result is displayed (no flickering from stale results)
- Filter results appear within 300ms of last keystroke

**Risks:** None significant. Well-understood patterns.

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Debounce filter input + request-ID guard + loading indicator

---

## Phase 2: Syntax Highlighting

**Goal:** Source code preview renders C/C++ with proper syntax highlighting using Shiki.

**Requirements:** SYNT-01, SYNT-02, SYNT-03, SYNT-04

**Key deliverables:**
- Shiki highlighter singleton (synchronous, JS engine, C/C++ grammar + Catppuccin Mocha theme)
- Updated SourceCodeView rendering tokens as colored spans
- Line numbers and active-line highlight preserved

**Key files to modify:**
- New: `src/lib/highlighter.ts` — Shiki singleton setup
- `src/components/CodePreview/CodePreview.tsx` — SourceCodeView token rendering
- `src/components/CodePreview/CodePreview.css` — token color overrides if needed

**Dependencies:** `npm install shiki`

**Estimated effort:** Small-Medium (2-3 hours)

**Success criteria:**
- C/C++ keywords, strings, comments, types render in distinct colors
- Theme matches existing app dark color scheme (Catppuccin Mocha)
- Line numbers remain aligned; active line still has yellow border emphasis
- No measurable performance regression on member click

**Risks:**
- Shiki ESM-only package + electron-vite may need Vite config tweak (low risk)

---

## Phase 3: Class Pinning + Multi-Class Graph

**Goal:** Users can pin multiple classes that all appear simultaneously in the graph with their connections, supporting disconnected islands.

**Requirements:** CPIN-01, CPIN-02, CPIN-03, CPIN-04, GRAP-01, GRAP-02, GRAP-03, GRAP-04, GRAP-05, GRAP-06, GRAP-07

**Key deliverables:**
- Store architecture: `pinnedClassIds: Set<string>`, `pinnedClasses: Map`, `focusedClassId`
- Pin/unpin UI in SymbolTree (pin icon per class) and graph nodes
- New `buildMultiClassGraph` function merging hierarchies of all pinned classes
- Connected component detection for island identification
- dagre layout with per-island positioning and spacing
- Visual distinction for focused vs pinned class nodes

**Key files to modify:**
- `src/stores/appStore.ts` — new pinned class state, actions, graph merging logic
- `src/components/SymbolTree/SymbolTree.tsx` — pin toggle per class item
- `src/components/GraphView/GraphView.tsx` — multi-class layout, island detection, dagre integration
- `src/components/GraphView/GraphView.css` — pinned vs focused node styles
- `src/types/model.ts` — new IPC channels for batch class data
- `electron/ipc/handlers.ts` — handlers for batch class hierarchy queries
- `plugins/vs-browse-db/VsBrowseDbPlugin.ts` — batch query methods

**Dependencies:** `npm install @dagrejs/dagre`

**Estimated effort:** Large (6-10 hours)

**Success criteria:**
- Pin 3+ classes from SymbolTree; all appear in graph simultaneously
- Inheritance edges between pinned classes are visible
- Disconnected classes form separate visual islands with clear spacing
- Clicking a pinned class node makes it the focused class (loads members + source)
- Pinned classes persist across navigation (selecting a new class doesn't clear pins)
- Graph handles 10 pinned classes without overlapping

**Risks:**
- dagre layout quality with mixed edge directions (inheritance TB + type-ref LR) — may need tuning
- Store refactor touches many components — needs careful incremental approach
- Graph rebuild performance with 10 expanded nodes — likely fine but needs testing

---

## Phase 4: State Persistence (Save/Load Pins)

**Goal:** Users can save their pinned class/member configuration to a JSON file and restore it later.

**Requirements:** SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-05

**Key deliverables:**
- JSON schema for pin save files (class IDs, member IDs, DB path, metadata)
- IPC handlers for save (dialog + write) and load (dialog + read + validate)
- Preload bridge + API wrappers
- Keyboard shortcuts (Ctrl+S to save, Ctrl+O to load) via renderer keydown handlers
- Validation: wrong-DB warning, missing symbol handling, partial load support

**Key files to modify:**
- `src/types/model.ts` — new IPC channels (`pins:save`, `pins:load`), save file schema types
- `electron/ipc/handlers.ts` — save/load IPC handlers with dialog + fs
- `electron/preload.ts` — expose save/load via contextBridge
- `src/api/index.ts` — save/load API wrappers
- `src/stores/appStore.ts` — `savePins`, `loadPins` actions
- `src/App.tsx` or top-level component — keyboard shortcut handlers

**Dependencies:** Phase 3 (class pinning must exist)

**Estimated effort:** Medium (3-5 hours)

**Success criteria:**
- Ctrl+S opens save dialog, writes JSON file with all pinned classes/members
- Ctrl+O opens load dialog, restores pins from JSON file
- Save file includes DB path; loading with wrong DB shows warning
- Missing classes/members are reported but remaining valid pins still load
- Round-trip: save → close app → reopen → load → identical pin state

**Risks:**
- Set serialization (`JSON.stringify(new Set())` → `{}`) — must convert to arrays
- Stale IDs after DB rebuild — mitigate with qualifiedName fallback

---

## Phase Summary

| Phase | Feature | Requirements | Effort | Dependencies |
|-------|---------|-------------|--------|--------------|
| 1 | Search Performance | SRCH-01..03 | 1-2 hrs | None |
| 2 | Syntax Highlighting | SYNT-01..04 | 2-3 hrs | None |
| 3 | Class Pinning + Graph | CPIN-01..04, GRAP-01..07 | 6-10 hrs | None |
| 4 | Save/Load Pins | SAVE-01..05 | 3-5 hrs | Phase 3 |

**Total estimated effort:** 12-20 hours

**Execution note:** Phases 1 and 2 can be executed in parallel or either order. Phase 3 must complete before Phase 4.

---
*Roadmap created: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*
