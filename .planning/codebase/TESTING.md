# Testing Patterns

**Analysis Date:** 2026-03-17

## Test Framework

**Runner:**
- No unit test framework configured (no Jest, Vitest, or Mocha)
- E2E testing uses Playwright (`playwright` v1.58.2 in devDependencies)
- E2E test script: `test-electron.mjs` — a standalone Node.js script (not a test runner suite)

**Assertion Library:**
- Custom inline `assert()` function in `test-electron.mjs`:
  ```javascript
  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`)
      passed++
    } else {
      console.error(`  ✗ FAIL: ${message}`)
      failed++
    }
  }
  ```
- No standard assertion library (no Chai, expect, node:assert)
- Tests continue on failure (not fail-fast) — all assertions run, summary printed at end

**Run Commands:**
```bash
# No test scripts in package.json
# E2E test requires manual steps:

# 1. Start the Electron app with remote debugging:
npx electron --remote-debugging-port=9222 .

# 2. Run the E2E test in a separate terminal:
node test-electron.mjs
```

**No `test` script in `package.json`.** There is no `npm test` command.

## Test File Organization

**Location:**
- Single E2E test file at project root: `test-electron.mjs`
- No unit tests exist anywhere in the codebase
- No `__tests__/`, `test/`, or `tests/` directories
- No co-located `*.test.ts` or `*.spec.ts` files

**Naming:**
- E2E test: `test-electron.mjs` (ESM module, plain JavaScript)

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

**Hard-coded paths:** The E2E test uses a hard-coded database path:
```javascript
const DB_PATH = 'D:/src/engine2/Sql/Picasso/Engine/src/.vs/server/v18/Browse.VC.db'
```
- This makes the test non-portable — it only works on the author's machine
- No test fixtures, factories, or mock data generators exist

## Mocking

**Framework:** None

**Current Approach:**
- E2E tests interact with the real application — no mocking at any level
- The test expects a real `Browse.VC.db` file at a specific path
- No mock IPC layer, no mock plugin, no mock data

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
- Not present. No unit test files exist.
- No test framework configured.

**Integration Tests:**
- Not present as separate tests.
- The E2E test implicitly tests integration between store → API → IPC → plugin.

**E2E Tests:**
- Single Playwright-based script: `test-electron.mjs`
- Tests the full UI flow: tree → selection → graph → code preview → search
- Uses CDP connection to a running Electron app
- Takes screenshots at each step for visual verification
- Requires manual app startup before running

## What Exists vs What's Missing

**Exists:**
- E2E test covering the main user flow (`test-electron.mjs`)
- Store exposed on `window.__telepathyStore` for test access
- Screenshot capture at each test step

**Missing (high priority for new code):**
- Unit test framework (recommend Vitest — already uses Vite)
- Unit tests for `PluginManager` (registration, activation, proxy routing, error states)
- Unit tests for `VsBrowseDbPlugin` (SQL mapping, type resolution, inheritance walking)
- Unit tests for Zustand store actions (navigation, loading states, error paths)
- Unit tests for `buildFlowElements` graph layout function in `GraphView.tsx`
- Test configuration in `package.json` scripts

**Missing (medium priority):**
- Mock plugin implementing `CodeAnalysisPlugin` for testing without a real DB
- Test fixtures (sample DB or JSON fixtures for known symbol graphs)
- CI pipeline running tests on push
- Coverage reporting

## Recommended Test Setup

When adding a test framework, use Vitest (aligns with existing Vite toolchain):

**Recommended `vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // for plugin/electron tests
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

**Recommended `package.json` scripts:**
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

**Recommended test file locations:**
- Plugin tests: `plugins/vs-browse-db/VsBrowseDbPlugin.test.ts`
- Plugin manager tests: `plugins/core/PluginManager.test.ts`
- Store tests: `src/stores/appStore.test.ts`
- Graph layout tests: `src/components/GraphView/buildFlowElements.test.ts`

**Recommended first test (PluginManager):**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { PluginManager } from './PluginManager'
import type { CodeAnalysisPlugin, PluginInfo } from './types'

function createMockPlugin(name: string): CodeAnalysisPlugin {
  return {
    info: { name, version: '1.0', description: 'test', supportedLanguages: [] },
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
    getClasses: vi.fn().mockResolvedValue([]),
    getClassDetail: vi.fn().mockResolvedValue(null),
    getClassHierarchy: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    searchSymbols: vi.fn().mockResolvedValue([]),
    getSourceSnippet: vi.fn().mockResolvedValue(''),
  }
}

describe('PluginManager', () => {
  it('registers and lists plugins', () => {
    const pm = new PluginManager()
    const plugin = createMockPlugin('test')
    pm.register(plugin)
    expect(pm.listPlugins()).toEqual([plugin.info])
  })

  it('throws when getting active before activation', () => {
    const pm = new PluginManager()
    expect(() => pm.getActive()).toThrow('No active plugin')
  })

  it('activates a plugin and routes queries', async () => {
    const pm = new PluginManager()
    const plugin = createMockPlugin('test')
    pm.register(plugin)
    await pm.activate('test', { dataPath: '/tmp/test.db' })
    await pm.getClasses()
    expect(plugin.getClasses).toHaveBeenCalled()
  })
})
```

---

*Testing analysis: 2026-03-17*
