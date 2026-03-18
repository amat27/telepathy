# Testing Patterns

**Analysis Date:** 2026-03-18 (updated from 2026-03-17)

## Test Framework

**Unit Test Runner:**
- Vitest 4.1.0 — configured via `vitest.config.ts`
- Environment: `node` (not jsdom)
- Globals: enabled (`describe`, `it`, `expect` available without import)
- Path alias: `@` → `src/`

**E2E Test Runner:**
- Playwright 1.58.2 — E2E testing via CDP connection to running Electron
- E2E test script: `test-electron.mjs` (standalone, not integrated into Vitest)

**Assertion Library:**
- Vitest's built-in `expect` for unit tests
- Custom inline `assert()` function in `test-electron.mjs` for E2E (legacy, continues on failure)

**Run Commands:**
```bash
# Unit tests
npx vitest run          # single run
npx vitest              # watch mode

# E2E test requires manual steps:
# 1. Start the Electron app with remote debugging:
npx electron --remote-debugging-port=9222 .
# 2. Run the E2E test in a separate terminal:
node test-electron.mjs
```

**Note:** No `test` script in `package.json` yet. Run Vitest directly via `npx`.

## Test File Organization

**Unit Tests:**
- `src/stores/__tests__/appStore.test.ts` — 5 tests covering `setClassFilter` debounce + `loadClasses` request-ID guard
- Pattern: co-located `__tests__/` directories alongside source

**E2E Tests:**
- `test-electron.mjs` (project root) — single Playwright CDP script

**Test Fixtures:**
- `test/fixtures/sample.db` — Small SQLite fixture matching Browse.VC.db v18 schema
  - 9 files, 69 code items, 8 classes/structs, 4 inheritance relationships
  - Fictional game-engine classes (Entity, Component, Transform, MeshRenderer, RigidBody, AudioSource, Vector3, Matrix4)
  - Exercises all 10 plugin prepared statements
- `test/fixtures/generate-db.cjs` — Regeneration script (run via `npx electron --no-sandbox test/fixtures/generate-db.cjs`)
- `test/fixtures/verify-db.cjs` — Verification script (validates all plugin queries against fixture)

**Important:** `better-sqlite3` is compiled for Electron's Node.js. All scripts using it must run via `npx electron --no-sandbox`, not bare `node`.

**Screenshot output:**
- Screenshots saved to `test-screenshots/` directory (gitignored)
- Named by test step: `01-initial.png`, `02-classes-loaded.png`, etc.

## E2E Test Structure

**Architecture:** The E2E test connects to a running Electron app via Chrome DevTools Protocol (CDP):

```javascript
const CDP_URL = 'http://localhost:9222'
const browser = await chromium.connectOverCDP(CDP_URL)
const page = browser.contexts()[0].pages()[0]
```

**Store Access:** Tests interact with the app through `window.__telepathyStore` (exposed in `src/stores/appStore.ts`):
```javascript
// Store is exposed for testing
if (typeof window !== 'undefined') {
  ;(window as any).__telepathyStore = useAppStore
}

// Test uses it to bypass UI for setup:
await page.evaluate(async (dbPath) => {
  await window.__telepathyStore.getState().openDatabase(dbPath)
}, DB_PATH)
```

**Test Flow (13 steps):**
1. Wait for app initialization (`window.__telepathyStore` available)
2. Open database via store action
3. Select first class in tree
4. Verify graph empty state (no member selected)
5. Click member → verify graph shows single member
6. Click different member → verify graph switches
7. Ctrl+Click to pin member → verify graph shows multiple
8. Member filter input → verify count reduces
9. Member sort dropdown → verify order changes
10. Group by kind toggle → verify group headers appear
11. Filter tree for specific class → verify hierarchy
12. Source code highlight → verify highlighted line
13. Ctrl+K search → verify search results

**Test Assertions Style:**
```javascript
const itemCount = await page.locator('.tree-item').count()
assert(itemCount > 0, `Tree items loaded: ${itemCount}`)
```

## Test Data

**Fixture Database:** `test/fixtures/sample.db`
- Small Browse.VC.db v18-compatible SQLite database with fictional game-engine data
- Can be regenerated via `npx electron --no-sandbox test/fixtures/generate-db.cjs`
- All 10 plugin prepared statements verified against it

**E2E test still uses hardcoded path:**
```javascript
const DB_PATH = 'D:/src/engine2/Sql/Picasso/Engine/src/.vs/server/v18/Browse.VC.db'
```
- Should be updated to use `test/fixtures/sample.db` or accept a CLI argument

## Mocking

**Framework:** Vitest's built-in `vi.mock()` and `vi.fn()`

**Current Approach:**
- Unit tests mock at the API/IPC boundary: `vi.mock('../../api')` replaces the entire API module
- Mocked functions: `getClasses`, `initPlugin`, `getClassDetail`, `getClassHierarchy`, `searchSymbols`, `getSourceSnippet`, `openDbDialog`
- `vi.useFakeTimers()` for debounce testing
- E2E tests interact with the real application — no mocking

**What Would Need Mocking for Unit Tests:**
- `window.telepathy` API bridge (for renderer-side unit tests)
- `better-sqlite3` Database (for plugin unit tests)
- `ipcRenderer.invoke` / `ipcMain.handle` (for IPC tests)
- `fs` module (for source snippet tests)
- Electron's `dialog` module (for file dialog tests)

## Coverage

**Requirements:** None enforced

**Coverage Tools:** None configured

**No coverage reports, thresholds, or CI gates.**

## Test Types

**Unit Tests:**
- 5 tests in `src/stores/__tests__/appStore.test.ts`
- Covers: `setClassFilter` debounce (3 tests), `loadClasses` request-ID guard (2 tests)
- Mocks API layer, uses fake timers

**Integration Tests:**
- Not present as separate tests.
- The fixture DB (`test/fixtures/sample.db`) enables future plugin integration tests.

**E2E Tests:**
- Single Playwright-based script: `test-electron.mjs`
- Tests the full UI flow: tree → selection → graph → code preview → search
- Uses CDP connection to a running Electron app
- Takes screenshots at each step for visual verification
- Requires manual app startup before running

## What Exists vs What's Missing

**Exists:**
- Vitest 4.1.0 configured with `vitest.config.ts`
- 5 unit tests for store debounce + request-ID guard
- Test fixture database (`test/fixtures/sample.db`) with 8 fictional classes
- Fixture generation + verification scripts
- E2E test covering the main user flow (`test-electron.mjs`)
- Store exposed on `window.__telepathyStore` for test access
- Screenshot capture at each test step
- `vi.mock()` patterns for API boundary mocking

**Missing (high priority for new code):**
- Unit tests for `VsBrowseDbPlugin` (SQL mapping, type resolution, inheritance walking) — fixture DB now makes this feasible
- Unit tests for `PluginManager` (registration, activation, proxy routing, error states)
- Unit tests for `buildFlowElements` graph layout function in `GraphView.tsx`
- `test` script in `package.json`

**Missing (medium priority):**
- Mock plugin implementing `CodeAnalysisPlugin` for testing without a real DB
- CI pipeline running tests on push
- Coverage reporting
- E2E test using fixture DB instead of hardcoded path

## Current Test Setup

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
```

**Recommended `package.json` scripts (not yet added):**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "node test-electron.mjs"
  }
}
```

**Recommended next tests (in priority order):**
1. `plugins/vs-browse-db/VsBrowseDbPlugin.test.ts` — use fixture DB for integration tests
2. `plugins/core/PluginManager.test.ts` — mock plugin for unit tests
3. `src/components/GraphView/buildFlowElements.test.ts` — layout correctness

---

*Testing analysis: 2026-03-18 (updated with Vitest, unit tests, and fixture DB)*
