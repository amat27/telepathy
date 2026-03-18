# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5.8 - All application code (main process, renderer, plugins, types)

**Secondary:**
- JavaScript (ESM) - E2E test script (`test-electron.mjs`)
- CSS - Component styles, no preprocessor (vanilla CSS with custom properties)
- HTML - Single `src/index.html` entry point for renderer

## Runtime

**Environment:**
- Node.js 22+ (detected: v22.22.0)
- Electron 41 (Chromium-based desktop shell)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Electron 41.0.2 - Desktop application shell, main/renderer process split
- React 19.2.4 - Renderer UI framework
- @xyflow/react 12.10.1 - Interactive node graph visualization (React Flow)
- Zustand 5.0.12 - State management (single flat store)
- Allotment 1.20.5 - Resizable split pane layout

**Testing:**
- Playwright 1.58.2 - E2E testing via Chrome DevTools Protocol (CDP) connection to Electron

**Build/Dev:**
- electron-vite 5.0.0 - Build tool orchestrating Vite for main/preload/renderer
- Vite 7.3.1 - Underlying bundler
- @vitejs/plugin-react 5.2.0 - React JSX/refresh support in Vite
- @electron/rebuild 4.0.3 - Rebuilds native modules for Electron's Node.js version

## Key Dependencies

**Critical:**
- `better-sqlite3` 12.8.0 - Native SQLite3 binding for reading Browse.VC.db databases. Requires native rebuild for Electron (`npm run rebuild-native`). Externalized from Vite bundling in `electron.vite.config.ts`.
- `@xyflow/react` 12.10.1 - Powers the entire center-panel graph visualization (class hierarchy, type edges, member display). Two custom node types registered: `classNode` and `expandedClassNode`.
- `zustand` 5.0.12 - Single store pattern in `src/stores/appStore.ts`. Store exposed on `window.__telepathyStore` for E2E testing.

**Infrastructure:**
- `@electron-toolkit/utils` 4.0.0 - Electron utilities (`electronApp`, `optimizer`, `is.dev` check)
- `fuse.js` 7.1.0 - Fuzzy search library (declared as dependency but not currently imported in any source file — may be planned for future use or superseded by SQL LIKE queries)

## TypeScript Configuration

**Base config:** `tsconfig.json`
- Target: ES2022
- Module: ESNext with bundler resolution
- JSX: react-jsx
- Strict mode: enabled
- Path aliases: `@/*` → `./src/*`

**Derived configs:**
- `tsconfig.node.json` — extends base, covers `electron/**/*` and `plugins/**/*`, outputs to `out/main/`
- `tsconfig.web.json` — extends base, covers `src/**/*`, outputs to `out/renderer/`

## Build Configuration

**Entry points defined in `electron.vite.config.ts`:**
- Main process: `electron/main.ts` → `out/main/main.js`
- Preload: `electron/preload.ts` → `out/preload/preload.js`
- Renderer: `src/index.html` + `src/main.tsx` → `out/renderer/`

**Key build details:**
- `externalizeDepsPlugin()` used for main and preload builds (keeps node_modules external)
- `better-sqlite3` explicitly listed in `rollupOptions.external` for main process
- React plugin applied only to renderer build
- Path alias `@` → `src/` configured in renderer resolve

**NPM scripts:**
```bash
npm run dev              # electron-vite dev (hot reload)
npm run build            # electron-vite build (production)
npm run preview          # electron-vite preview
npm run rebuild-native   # electron-rebuild -f -w better-sqlite3
```

## Content Security Policy

Defined in `src/index.html`:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
```

## Electron Security

Configured in `electron/main.ts`:
- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: false` — required for preload script to use Node.js APIs
- Communication via `contextBridge.exposeInMainWorld('telepathy', api)` in `electron/preload.ts`

## Platform Requirements

**Development:**
- Node.js 20+ (README) / 22+ (detected)
- Visual Studio solution opened at least once (to generate Browse.VC.db)
- Windows (primary target; paths and Electron binary assume Windows)

**Production:**
- Electron binary: `node_modules/electron/dist/electron.exe out/main/main.js`
- No installer/packaging configured (no electron-builder, electron-forge, etc.)
- Native module `better-sqlite3` must be rebuilt for target Electron version

**No CI/CD pipeline configured** — no GitHub Actions workflows, no Dockerfile.

## Configuration Files

| File | Purpose |
|------|---------|
| `electron.vite.config.ts` | Build config for main/preload/renderer |
| `tsconfig.json` | Base TypeScript config |
| `tsconfig.node.json` | Main process TypeScript config |
| `tsconfig.web.json` | Renderer TypeScript config |
| `package.json` | Dependencies and scripts |
| `.gitignore` | Excludes node_modules, out, dist, screenshots |
| `openspec/config.yaml` | OpenSpec workflow config (unused) |
| `.planning/config.json` | GSD workflow config |

---

*Stack analysis: 2026-03-17*
