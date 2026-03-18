# Research: Save/Load Pinned State

**Date:** 2026-03-17
**Confidence:** HIGH (Electron official docs verified, codebase patterns analyzed)
**Sources:** Electron 41 official docs, Telepathy codebase analysis

---

## 1. JSON Schema Design

### What to Save

The save file needs to fully reconstruct the pinned state against the *same* database. It should also carry enough metadata to detect mismatches and enable future migration.

```jsonc
{
  // --- Metadata (for validation & migration) ---
  "version": 1,
  "savedAt": "2026-03-17T10:30:00.000Z",
  "app": "telepathy",

  // --- Database identity (for mismatch detection) ---
  "database": {
    "path": "C:/Users/joe/project/.vs/Browse.VC.db",
    "plugin": "vs-browse-db"
  },

  // --- The actual pinned state ---
  "pinnedClasses": [
    {
      "classId": "abc123",
      "qualifiedName": "ns::MyClass",       // human-readable fallback
      "pinnedMemberIds": ["def456", "ghi789"],
      "pinnedMemberNames": ["ns::MyClass::foo", "ns::MyClass::bar"]  // human-readable fallback
    }
  ]
}
```

### Design Rationale

| Field | Why |
|-------|-----|
| `version` | Schema migration — if we add fields later, loaders can branch on version |
| `savedAt` | Human debugging ("when was this saved?") |
| `database.path` | Primary mismatch detection — warn if loading against a different DB |
| `database.plugin` | Future-proofing — if we add plugins beyond `vs-browse-db` |
| `classId` / `pinnedMemberIds` | The actual IDs from the DB — what the store needs |
| `qualifiedName` / `pinnedMemberNames` | **Fallback for soft matching.** If the DB was rebuilt and IDs changed, we can attempt name-based resolution. Also makes the JSON human-readable. |

### Why Not Save More?

- **Don't save `selectedClass`** — that's navigation state, not pin state. The user should explicitly navigate after loading.
- **Don't save `graph`** — derived from pins + DB, will be reconstructed.
- **Don't save `navBackStack`/`navForwardStack`** — navigation history is session-specific.

### File Extension

Use `.telepathy-pins.json` or just `.json`. Recommend the former — it's self-documenting and avoids collision with other JSON files. The dialog filter handles this.

---

## 2. Electron Dialog API

**Source:** [Electron dialog docs](https://www.electronjs.org/docs/latest/api/dialog) (verified 2026-03-17)

The existing codebase already uses `dialog.showOpenDialog` in `handlers.ts` line 47 for DB opening. Follow the same pattern.

### Save Dialog

```typescript
// In electron/ipc/handlers.ts
ipcMain.handle(IPC_CHANNELS.SAVE_PINS_DIALOG, async (_event, defaultName?: string) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    title: 'Save Pinned State',
    defaultPath: defaultName ?? 'pins.telepathy-pins.json',
    filters: [
      { name: 'Telepathy Pins', extensions: ['telepathy-pins.json', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['showOverwriteConfirmation'],
  })
  return result.canceled ? null : result.filePath
})
```

### Open Dialog

```typescript
ipcMain.handle(IPC_CHANNELS.LOAD_PINS_DIALOG, async () => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    title: 'Load Pinned State',
    filters: [
      { name: 'Telepathy Pins', extensions: ['telepathy-pins.json', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})
```

### Important: Pass `BrowserWindow` for Modal Behavior

The dialog docs say: *"The `window` argument allows the dialog to attach itself to a parent window, making it modal."* Without it, the dialog floats as a separate window. The codebase's existing `OPEN_DB_DIALOG` handler doesn't pass a window — we should fix this for the new handlers (and consider fixing the existing one). Use `BrowserWindow.getFocusedWindow()`.

---

## 3. File I/O via IPC

### Architecture Decision: Main Process Does All File I/O

**Do NOT use `fs` in the renderer.** The app has `contextIsolation: true` and `nodeIntegration: false` (main.ts line 25-26). This is correct and should stay that way.

**Pattern:** Renderer requests file path via dialog IPC, then sends data to main for writing (or receives data from main after reading).

### Two Approaches — Recommend Approach B

#### Approach A: Separate dialog + read/write channels (3 IPC calls)
```
Renderer: invoke('dialog:save-pins') → gets filePath
Renderer: invoke('pins:save', { filePath, data }) → main writes file
```

#### Approach B: Combined dialog + I/O in one handler (1 IPC call) ✅ Recommended
```
Renderer: invoke('pins:save', { data }) → main shows dialog + writes file
Renderer: invoke('pins:load') → main shows dialog + reads file → returns data
```

**Why Approach B:** Fewer round-trips. The renderer doesn't need the file path at all — it just needs "save succeeded" or "here's the loaded data." This also prevents a TOCTOU issue where the file could change between getting the path and doing the I/O.

### Implementation

```typescript
// In electron/ipc/handlers.ts

import { readFile, writeFile } from 'node:fs/promises'

ipcMain.handle(IPC_CHANNELS.SAVE_PINS, async (_event, jsonString: string) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    title: 'Save Pinned State',
    defaultPath: 'pins.telepathy-pins.json',
    filters: [
      { name: 'Telepathy Pins', extensions: ['telepathy-pins.json', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['showOverwriteConfirmation'],
  })
  if (result.canceled || !result.filePath) return { success: false, reason: 'canceled' }

  try {
    await writeFile(result.filePath, jsonString, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (err) {
    return { success: false, reason: String(err) }
  }
})

ipcMain.handle(IPC_CHANNELS.LOAD_PINS, async () => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    title: 'Load Pinned State',
    filters: [
      { name: 'Telepathy Pins', extensions: ['telepathy-pins.json', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  try {
    const raw = await readFile(result.filePaths[0], 'utf-8')
    return { data: raw, filePath: result.filePaths[0] }
  } catch (err) {
    return { error: String(err) }
  }
})
```

### IPC Channel Registration

Add to `src/types/model.ts`:

```typescript
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Pin state persistence
  SAVE_PINS: 'pins:save',
  LOAD_PINS: 'pins:load',
} as const
```

### Preload Bridge

Add to `electron/preload.ts`:

```typescript
const api = {
  // ... existing methods ...

  savePins: (jsonString: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PINS, jsonString),
  loadPins: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LOAD_PINS),
}
```

### Renderer API Wrapper

Add to `src/api/index.ts`:

```typescript
export async function savePins(jsonString: string): Promise<{ success: boolean, filePath?: string, reason?: string }> {
  return api().savePins(jsonString)
}

export async function loadPins(): Promise<{ data: string, filePath: string } | { error: string } | null> {
  return api().loadPins()
}
```

---

## 4. Keyboard Shortcuts — Menu Accelerators (Not globalShortcut)

### Three Options Compared

| Approach | Scope | How | Pros | Cons |
|----------|-------|-----|------|------|
| **`globalShortcut`** | System-wide | `globalShortcut.register('CmdOrCtrl+S', ...)` | Works when unfocused | **Steals Ctrl+S from ALL apps.** Wrong for this use case. Has macOS bugs with non-QWERTY layouts. |
| **Menu accelerators** | App-focused | `{ accelerator: 'CmdOrCtrl+S', click: ... }` on MenuItem | Native feel, shows in menu, only active when app focused | Requires building an application menu |
| **Renderer `keydown`** | Window-focused | `window.addEventListener('keydown', ...)` | Simple, already used in codebase | No menu visibility, must handle Cmd vs Ctrl manually, can conflict with input fields |

### Recommendation: Use Menu Accelerators ✅

**Why:** Ctrl+S and Ctrl+O are standard app-level shortcuts. They should:
1. Only work when Telepathy is focused (not system-wide → rules out `globalShortcut`)
2. Be visible in the File menu (users discover shortcuts there)
3. Not conflict with text inputs (menu accelerators don't fire when typing in an input with the same key combo — they're handled at a higher level)

The codebase currently has **no application menu** (no `Menu.setApplicationMenu` call in `main.ts`). Electron provides a default menu. We need to build a custom one.

### Implementation: Application Menu

Create `electron/menu.ts`:

```typescript
import { Menu, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export function buildAppMenu(handlers: {
  onSavePins: () => void
  onLoadPins: () => void
  onOpenDb: () => void
}): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        {
          label: 'Open Database...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: handlers.onOpenDb,
        },
        { type: 'separator' },
        {
          label: 'Save Pins...',
          accelerator: 'CmdOrCtrl+S',
          click: handlers.onSavePins,
        },
        {
          label: 'Load Pins...',
          accelerator: 'CmdOrCtrl+O',
          click: handlers.onLoadPins,
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]

  // macOS needs the app menu as first item
  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' })
  }

  return Menu.buildFromTemplate(template)
}
```

Wire it up in `main.ts`:

```typescript
import { buildAppMenu } from './menu'

app.whenReady().then(() => {
  // ... existing setup ...

  const menu = buildAppMenu({
    onSavePins: () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) win.webContents.send('menu:save-pins')
    },
    onLoadPins: () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) win.webContents.send('menu:load-pins')
    },
    onOpenDb: () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) win.webContents.send('menu:open-db')
    },
  })
  Menu.setApplicationMenu(menu)
})
```

### Alternative: Keep Renderer-Side Keydown for Simplicity

If building a full menu is out of scope for this milestone, the existing renderer-side pattern works fine. Add to `App.tsx`:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSavePins()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault()
      handleLoadPins()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [handleSavePins, handleLoadPins])
```

**Tradeoff:** This works but won't show shortcuts in a menu. Acceptable for now if menu building is deferred.

### Recommendation

**Phase 1:** Use renderer-side `keydown` handlers (consistent with existing patterns for Alt+Arrow and Ctrl+K).
**Phase 2 (later):** Build proper application menu with accelerators. This is a bigger task and should be its own milestone.

---

## 5. Validation on Load

Loading a pin file against the wrong database (or a rebuilt database) is the primary failure mode. Handle it gracefully.

### Validation Steps (in order)

```typescript
interface LoadValidation {
  dbPathMatch: boolean       // saved path === current path
  allClassesFound: boolean   // all class IDs exist in current DB
  allMembersFound: boolean   // all member IDs exist
  missingClasses: string[]   // class qualifiedNames that weren't found
  missingMembers: string[]   // member qualifiedNames that weren't found
}
```

#### Step 1: Schema Version Check
```typescript
if (parsed.version !== 1) {
  // Future: run migration. For now, reject.
  throw new Error(`Unsupported pin file version: ${parsed.version}`)
}
```

#### Step 2: Database Path Warning (Non-Blocking)
```typescript
if (parsed.database.path !== currentDbPath) {
  // Show warning but don't block — user might have moved/renamed the DB
  // "This pin file was saved against a different database. Some pins may not match."
}
```

#### Step 3: Resolve Class IDs
```typescript
for (const pinned of parsed.pinnedClasses) {
  // Try by ID first (fast, exact)
  const cls = await api.getClassDetail(pinned.classId)
  if (cls) {
    resolved.push({ ...pinned, resolved: true })
    continue
  }

  // Fallback: search by qualifiedName
  const results = await api.searchSymbols(pinned.qualifiedName, [SymbolKind.Class], 1)
  if (results.length > 0) {
    resolved.push({ ...pinned, classId: results[0].id, resolved: true })
    continue
  }

  // Not found
  missing.push(pinned.qualifiedName)
}
```

#### Step 4: Resolve Member IDs (Same Pattern)
For each resolved class, validate member IDs. If a member ID doesn't exist, fall back to searching by name within the class members.

#### Step 5: Report Results
```typescript
if (missing.length > 0) {
  // Show a non-modal notification/toast:
  // "Loaded 5/7 pinned classes. 2 classes not found: Foo::Bar, Baz::Qux"
}
```

### Key Principle: Partial Load is Better Than Total Failure

Never reject the entire file because some pins are missing. Load what you can, report what's missing. The user can fix or re-pin manually.

---

## 6. Store Integration

### New Store State & Actions

```typescript
interface AppState {
  // ... existing state ...

  // Pinned classes (new — currently only members are pinned)
  pinnedClasses: Set<string>     // class IDs

  // Actions
  toggleClassPin: (classId: string) => void
  savePins: () => Promise<void>
  loadPins: () => Promise<void>
  clearAllPins: () => void
}
```

### Serializing Pins for Save

The store has `pinnedClasses: Set<string>` and `selectedMembers: Set<string>`. To build the save file, we need to group members by their parent class:

```typescript
// In the savePins action
const { pinnedClasses, selectedMembers, classes } = get()

// For each pinned class, gather its pinned members
const pinnedData = [...pinnedClasses].map(classId => {
  const cls = classes.find(c => c.id === classId)
  // Get detail to find member qualified names (may need async call)
  return {
    classId,
    qualifiedName: cls?.qualifiedName ?? 'unknown',
    pinnedMemberIds: [...selectedMembers].filter(mId => /* is member of this class */),
    pinnedMemberNames: [], // populated after resolving
  }
})
```

**Challenge:** `selectedMembers` is a flat `Set<string>` with no parent class association. The store needs either:
1. A map `pinnedMembersByClass: Map<string, Set<string>>` instead of flat `selectedMembers`, or
2. At save time, load each pinned class's detail to determine which members belong to which class.

**Recommendation:** Option 1 is cleaner for the save/load use case. But this changes the data model. If refactoring `selectedMembers` is out of scope, option 2 works as a pragmatic fallback.

---

## 7. Summary of Changes Required

### Files to Modify

| File | Change |
|------|--------|
| `src/types/model.ts` | Add `SAVE_PINS` and `LOAD_PINS` to `IPC_CHANNELS` |
| `electron/preload.ts` | Add `savePins` and `loadPins` to exposed API |
| `electron/ipc/handlers.ts` | Add save/load handlers with dialog + fs |
| `src/api/index.ts` | Add `savePins()` and `loadPins()` wrapper functions |
| `src/stores/appStore.ts` | Add `pinnedClasses`, `savePins`, `loadPins`, `clearAllPins` actions |
| `src/App.tsx` | Add Ctrl+S / Ctrl+O keyboard handlers |

### Files to Create

| File | Purpose |
|------|---------|
| `src/types/pin-file.ts` | TypeScript interfaces for the save file schema |
| `src/utils/pin-validation.ts` | Validation logic for loaded pin files |
| `electron/menu.ts` | Application menu (if implementing in this milestone) |

### Dependency Order

```
1. IPC_CHANNELS (model.ts)          — no dependencies
2. Pin file schema (pin-file.ts)    — no dependencies
3. IPC handlers (handlers.ts)       — depends on 1
4. Preload bridge (preload.ts)      — depends on 1
5. API wrapper (api/index.ts)       — depends on 4
6. Validation utils (pin-validation.ts) — depends on 2
7. Store actions (appStore.ts)      — depends on 5, 6
8. Keyboard shortcuts (App.tsx)     — depends on 7
9. Application menu (menu.ts)       — depends on 3 (optional, can defer)
```

---

## 8. Pitfalls & Edge Cases

### Pitfall: Ctrl+S Conflicts in Search Input
When the user is typing in the search bar and hits Ctrl+S, should it save pins or insert into the input? **Answer:** Ctrl+S should always save — it's never valid text input. The `keydown` handler should call `e.preventDefault()` unconditionally for Ctrl+S.

### Pitfall: Saving With No Pins
If there are no pinned classes or members, the save action should either:
- Show a toast "Nothing to save" and skip the dialog, OR
- Save an empty file (valid schema, empty arrays)

**Recommendation:** Skip the dialog with a toast. Don't create empty files.

### Pitfall: Large Pin Files
If the user pins 100+ classes with all members, the JSON could be significant. This is unlikely in practice but `JSON.stringify` with 2-space indent is fine. No streaming needed.

### Pitfall: File Permissions / Write Failure
The IPC handler wraps `writeFile` in try/catch and returns `{ success: false, reason }`. The renderer should show the error to the user.

### Pitfall: `Set` Serialization
`JSON.stringify(new Set())` produces `{}` not `[]`. Always convert `Set<string>` to `Array<string>` before serializing: `[...mySet]`.

### Pitfall: Race Condition — Loading Pins Before DB is Open
The `loadPins` action must check `isConnected` before proceeding. If no DB is open, show an error.

### Pitfall: macOS File Extension Handling
On macOS, `dialog.showSaveDialog` may not auto-append the extension from filters. The handler should check if the returned `filePath` ends with `.json` and append it if not. (Windows handles this automatically.)

```typescript
let filePath = result.filePath
if (!filePath.endsWith('.json')) {
  filePath += '.telepathy-pins.json'
}
```

---

## 9. Open Questions for Implementation

1. **Should `pinnedClasses` be a new concept or reuse `selectedMembers`?** Currently the store only tracks `selectedMembers: Set<string>`. Adding class-level pinning is a separate concern. Recommend adding `pinnedClasses: Set<string>` as a new field.

2. **Menu bar or no menu bar?** Building an application menu is valuable but changes the app feel. If the project has been running with Electron's default menu, switching to a custom one needs intentionality. Recommend: add the menu but preserve existing default roles (`editMenu`, `viewMenu`, `windowMenu`).

3. **Auto-save?** Some apps auto-save state to `app.getPath('userData')`. This could be a follow-up: auto-persist pin state to a default location so it survives app restarts even without explicit save.
