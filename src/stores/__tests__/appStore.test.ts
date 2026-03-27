// ============================================================
// Tab management tests for appStore
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore, defaultTabState, captureTabState, isTabDirty } from '../appStore'
import { serializeTab, serializeSession, buildSessionKey } from '../sessionSerializer'
import { CURRENT_SESSION_VERSION } from '../../../electron/storage/sessionMigrations'
import type { SessionData } from '../../../electron/storage/types'
import * as apiModule from '../../api'

// Mock the API module — all async calls resolve immediately
vi.mock('../../api', () => ({
  initPlugin: vi.fn().mockResolvedValue(undefined),
  getClasses: vi.fn().mockResolvedValue([]),
  getClassDetail: vi.fn().mockImplementation((id: string) =>
    Promise.resolve({
      id,
      name: `Class_${id}`,
      kind: 1,
      members: [],
      bases: [],
      derived: [],
      location: { file: 'test.cpp', line: 10, column: 1 },
    })
  ),
  getClassHierarchy: vi.fn().mockImplementation((id: string) =>
    Promise.resolve({
      nodes: [{ id, name: `Class_${id}`, kind: 1 }],
      edges: [],
    })
  ),
  searchSymbols: vi.fn().mockImplementation((query: string) => {
    // Return exact matches for known test classes
    const known: Record<string, { id: string; name: string }> = {
      ClassA: { id: 'id-A', name: 'ClassA' },
      ClassB: { id: 'id-B', name: 'ClassB' },
      PCASTBatch: { id: 'id-P', name: 'PCASTBatch' },
    }
    const match = known[query]
    if (match) {
      return Promise.resolve([{
        id: match.id,
        name: match.name,
        qualifiedName: match.name,
        kind: 'class',
        file: 'test.cpp',
        line: 1,
      }])
    }
    return Promise.resolve([])
  }),
  getSourceSnippet: vi.fn().mockResolvedValue('10: void foo() {'),
  sessionSave: vi.fn().mockResolvedValue(undefined),
  sessionLoad: vi.fn().mockResolvedValue(null),
  sessionDelete: vi.fn().mockResolvedValue(undefined),
}))

function getState() {
  return useAppStore.getState()
}

function setState(partial: Partial<ReturnType<typeof useAppStore.getState>>) {
  useAppStore.setState(partial as any)
}

describe('Tab Management', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    const initial = defaultTabState()
    useAppStore.setState({
      ...initial,
      isConnected: false,
      dbPath: null,
      classes: [],
      classFilter: '',
      isLoadingClasses: false,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      tabs: [{ id: 'tab-init', label: 'New Tab', state: defaultTabState() }],
      activeTabId: 'tab-init',
      tabRestoreQueue: new Map(),
      savedViews: { classView: [], callstack: [] },
      activeSidePanel: null,
    })
  })

  // ---- Initial state ----

  it('starts with a single empty tab', () => {
    const { tabs, activeTabId } = getState()
    expect(tabs).toHaveLength(1)
    expect(activeTabId).toBe(tabs[0].id)
    expect(tabs[0].label).toBe('New Tab')
  })

  // ---- createTab ----

  it('createTab adds a new tab and switches to it', async () => {
    const oldTabId = getState().activeTabId
    await getState().createTab()

    const { tabs, activeTabId } = getState()
    expect(tabs).toHaveLength(2)
    expect(activeTabId).not.toBe(oldTabId)
    // New tab should be empty
    expect(getState().selectedClass).toBeNull()
    expect(getState().graph).toBeNull()
  })

  it('createTab with classId loads the class', async () => {
    await getState().createTab('cls-42')

    const { tabs, activeTabId, selectedClass } = getState()
    expect(tabs).toHaveLength(2)
    expect(selectedClass).not.toBeNull()
    expect(selectedClass!.id).toBe('cls-42')
    // Tab label should be the class name
    const activeTab = tabs.find(t => t.id === activeTabId)
    expect(activeTab!.label).toBe('Class_cls-42')
  })

  it('createTab preserves previous tab state', async () => {
    // Load a class in the first tab
    await getState().selectClass('cls-1')
    const firstTabId = getState().activeTabId!

    // Create a new tab
    await getState().createTab()

    // The first tab's stored state should have the class
    const firstTab = getState().tabs.find(t => t.id === firstTabId)
    expect(firstTab).toBeDefined()
    expect(firstTab!.state.selectedClass).not.toBeNull()
    expect(firstTab!.state.selectedClass!.id).toBe('cls-1')
  })

  // ---- switchTab ----

  it('switchTab restores the target tab state', async () => {
    // Load a class in tab 1
    await getState().selectClass('cls-1')
    const tab1Id = getState().activeTabId!

    // Create tab 2 with a different class
    await getState().createTab('cls-2')
    const tab2Id = getState().activeTabId!

    expect(getState().selectedClass!.id).toBe('cls-2')

    // Switch back to tab 1
    getState().switchTab(tab1Id)
    expect(getState().activeTabId).toBe(tab1Id)
    expect(getState().selectedClass!.id).toBe('cls-1')

    // Switch to tab 2 again
    getState().switchTab(tab2Id)
    expect(getState().activeTabId).toBe(tab2Id)
    expect(getState().selectedClass!.id).toBe('cls-2')
  })

  it('switchTab to same tab is a no-op', async () => {
    const tabId = getState().activeTabId!
    const stateBefore = captureTabState(getState())
    getState().switchTab(tabId)
    const stateAfter = captureTabState(getState())
    expect(stateAfter.selectedClass).toBe(stateBefore.selectedClass)
  })

  it('switchTab to non-existent tab is a no-op', () => {
    const tabId = getState().activeTabId!
    getState().switchTab('non-existent')
    expect(getState().activeTabId).toBe(tabId)
  })

  it('switchTab clears stale loading flags', async () => {
    // Load a class in tab 1
    await getState().selectClass('cls-1')
    const tab1Id = getState().activeTabId!

    // Create tab 2
    await getState().createTab()
    const tab2Id = getState().activeTabId!

    // Manually set loading flags on tab 1's stored state (simulating stale async)
    useAppStore.setState({
      tabs: getState().tabs.map(t =>
        t.id === tab1Id
          ? { ...t, state: { ...t.state, isLoadingDetail: true, isLoadingGraph: true } }
          : t
      ),
    }, false)

    // Switch to tab 1 — loading flags should be cleared
    getState().switchTab(tab1Id)
    expect(getState().isLoadingDetail).toBe(false)
    expect(getState().isLoadingGraph).toBe(false)
  })

  // ---- closeTab ----

  it('closeTab with multiple tabs removes the tab', async () => {
    await getState().createTab('cls-1')
    const tab2Id = getState().activeTabId!
    expect(getState().tabs).toHaveLength(2)

    getState().closeTab(tab2Id)
    expect(getState().tabs).toHaveLength(1)
    expect(getState().activeTabId).not.toBe(tab2Id)
  })

  it('closeTab switches to adjacent tab when closing active', async () => {
    const tab1Id = getState().activeTabId!
    await getState().createTab('cls-2')
    const tab2Id = getState().activeTabId!
    await getState().createTab('cls-3')
    const tab3Id = getState().activeTabId!

    // Close tab 3 (active, last) — should switch to tab 2
    getState().closeTab(tab3Id)
    expect(getState().activeTabId).toBe(tab2Id)
    expect(getState().selectedClass!.id).toBe('cls-2')
  })

  it('closeTab on background tab does not change active', async () => {
    const tab1Id = getState().activeTabId!
    await getState().createTab('cls-2')
    const tab2Id = getState().activeTabId!

    // Close tab 1 (background)
    getState().closeTab(tab1Id)
    expect(getState().activeTabId).toBe(tab2Id)
    expect(getState().tabs).toHaveLength(1)
  })

  it('closing last tab resets to fresh empty tab', () => {
    const tabId = getState().activeTabId!
    getState().closeTab(tabId)

    const { tabs, activeTabId, selectedClass } = getState()
    expect(tabs).toHaveLength(1)
    expect(activeTabId).toBe(tabs[0].id)
    expect(activeTabId).not.toBe(tabId) // new ID
    expect(selectedClass).toBeNull()
    expect(tabs[0].label).toBe('New Tab')
  })

  it('closeTab with non-existent tabId is a no-op', async () => {
    await getState().createTab()
    const count = getState().tabs.length
    getState().closeTab('non-existent')
    expect(getState().tabs).toHaveLength(count)
  })

  // ---- Navigation history is per-tab ----

  it('navigation history is isolated per tab', async () => {
    // Navigate A -> B in tab 1
    await getState().selectClass('cls-A')
    await getState().selectClass('cls-B')
    expect(getState().navBackStack).toEqual(['cls-A'])

    const tab1Id = getState().activeTabId!

    // Create tab 2 — should have empty nav
    await getState().createTab('cls-C')
    expect(getState().navBackStack).toEqual([])

    // Switch back to tab 1 — should have nav history
    getState().switchTab(tab1Id)
    expect(getState().navBackStack).toEqual(['cls-A'])
  })

  // ---- Tab label updates ----

  it('selectClass updates the tab label', async () => {
    await getState().selectClass('cls-42')
    const tabId = getState().activeTabId!
    const tab = getState().tabs.find(t => t.id === tabId)
    expect(tab!.label).toBe('Class_cls-42')
  })

  // ---- defaultTabState ----

  it('defaultTabState returns clean empty state', () => {
    const state = defaultTabState()
    expect(state.selectedClass).toBeNull()
    expect(state.selectedMember).toBeNull()
    expect(state.selectedMembers.size).toBe(0)
    expect(state.graph).toBeNull()
    expect(state.sourceCode).toBe('')
    expect(state.sourceFile).toBeNull()
    expect(state.sourceLine).toBe(0)
    expect(state.navBackStack).toHaveLength(0)
    expect(state.navForwardStack).toHaveLength(0)
    expect(state.isLoadingDetail).toBe(false)
    expect(state.isLoadingGraph).toBe(false)
  })

  // ---- captureTabState ----

  it('captureTabState captures flat state correctly', async () => {
    await getState().selectClass('cls-5')
    const captured = captureTabState(getState())
    expect(captured.selectedClass!.id).toBe('cls-5')
    expect(captured.sourceCode).toBe('10: void foo() {')
    expect(captured.sourceLine).toBe(10)
  })

  // ---- previewClass ----

  it('previewClass sets previewedClass without changing graph or selectedClass', async () => {
    // Select a class first
    await getState().selectClass('cls-1')
    const originalGraph = getState().graph
    const originalSelectedClass = getState().selectedClass

    // Preview a different class
    await getState().previewClass('cls-2')

    expect(getState().previewedClass).not.toBeNull()
    expect(getState().previewedClass!.id).toBe('cls-2')
    // selectedClass and graph should remain unchanged
    expect(getState().selectedClass).toBe(originalSelectedClass)
    expect(getState().graph).toBe(originalGraph)
  })

  it('previewClass loads source for the previewed class', async () => {
    await getState().previewClass('cls-3')

    expect(getState().previewedClass!.id).toBe('cls-3')
    // Source should have been loaded (mock returns '10: void foo() {')
    expect(getState().sourceCode).toBe('10: void foo() {')
  })

  it('selectClass clears previewedClass', async () => {
    // Set up a preview
    await getState().previewClass('cls-2')
    expect(getState().previewedClass).not.toBeNull()

    // Navigate via selectClass — should clear preview
    await getState().selectClass('cls-3')
    expect(getState().previewedClass).toBeNull()
  })

  it('defaultTabState includes previewedClass as null', () => {
    const state = defaultTabState()
    expect(state.previewedClass).toBeNull()
  })

  it('captureTabState captures previewedClass', async () => {
    await getState().previewClass('cls-7')
    const captured = captureTabState(getState())
    expect(captured.previewedClass).not.toBeNull()
    expect(captured.previewedClass!.id).toBe('cls-7')
  })

  // ---- loadCallstack (linear chain) ----

  it('loadCallstack creates linear chain with one node per frame', async () => {
    const callstack = `\tClassA::Method1\tC++
\tClassB::Method2\tC++
\tClassA::Method3\tC++`

    await getState().loadCallstack(callstack)

    const { graph, tabs, activeTabId } = getState()
    expect(graph).not.toBeNull()

    // Should have 3 nodes (one per frame), NOT deduplicated
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.nodes[0].id).toBe('cs-frame-0')
    expect(graph!.nodes[1].id).toBe('cs-frame-1')
    expect(graph!.nodes[2].id).toBe('cs-frame-2')

    // Nodes should use frame labels (full symbol name)
    expect(graph!.nodes[0].name).toContain('ClassA')
    expect(graph!.nodes[1].name).toContain('ClassB')
    expect(graph!.nodes[2].name).toContain('ClassA')

    // Should have 2 edges (linear: 0→1, 1→2)
    expect(graph!.edges).toHaveLength(2)
    expect(graph!.edges[0].source).toBe('cs-frame-0')
    expect(graph!.edges[0].target).toBe('cs-frame-1')
    expect(graph!.edges[1].source).toBe('cs-frame-1')
    expect(graph!.edges[1].target).toBe('cs-frame-2')

    // Resolved nodes should have typeClassId set (from searchSymbols)
    expect(graph!.nodes[0].typeClassId).toBeDefined()
    expect(graph!.nodes[1].typeClassId).toBeDefined()

    // Should be in a new "Callstack" tab
    const activeTab = tabs.find(t => t.id === activeTabId)
    expect(activeTab!.label).toBe('Callstack')

    // selectedClass should be null (callstack mode)
    expect(getState().selectedClass).toBeNull()
  })

  it('loadCallstack with duplicate classes produces separate nodes', async () => {
    const callstack = `\tPCASTBatch::Dispatch::__l229::<lambda>\tC++
\tPCASTBatch::Dispatch\tC++`

    await getState().loadCallstack(callstack)

    const { graph } = getState()
    expect(graph).not.toBeNull()
    // Each frame gets its own node even though same class
    expect(graph!.nodes).toHaveLength(2)
    expect(graph!.nodes[0].id).toBe('cs-frame-0')
    expect(graph!.nodes[1].id).toBe('cs-frame-1')
    expect(graph!.edges).toHaveLength(1)
  })
})

// ============================================================
// Pin Feature Tests
// ============================================================

describe('Pin Feature', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...defaultTabState(),
      isConnected: true,
      dbPath: '/test.db',
      activeTabId: 'pin-test-tab',
      tabs: [{
        id: 'pin-test-tab',
        label: 'Test',
        state: defaultTabState(),
      }],
    })
  })

  describe('togglePinClass', () => {
    it('pins a class by fetching its detail', async () => {
      await getState().togglePinClass('c1')

      const { pinnedClasses } = getState()
      expect(pinnedClasses.size).toBe(1)
      expect(pinnedClasses.has('c1')).toBe(true)
      expect(pinnedClasses.get('c1')!.name).toBe('Class_c1')
    })

    it('unpins a previously pinned class', async () => {
      await getState().togglePinClass('c1')
      expect(getState().pinnedClasses.size).toBe(1)

      await getState().togglePinClass('c1')
      expect(getState().pinnedClasses.size).toBe(0)
    })

    it('removes child pinned members when unpinning a class', async () => {
      await getState().togglePinClass('c1')

      // Manually add a pinned member belonging to c1
      const member = { id: 'm1', name: 'field', qualifiedName: 'c1::field', kind: 'member' as any, location: { file: 'test.cpp', line: 1, column: 0 } }
      getState().togglePinMember(member, 'c1')
      expect(getState().pinnedMembers.size).toBe(1)

      // Unpin the class — member should also be removed
      await getState().togglePinClass('c1')
      expect(getState().pinnedClasses.size).toBe(0)
      expect(getState().pinnedMembers.size).toBe(0)
    })

    it('can pin multiple classes', async () => {
      await getState().togglePinClass('c1')
      await getState().togglePinClass('c2')

      expect(getState().pinnedClasses.size).toBe(2)
      expect(getState().pinnedClasses.has('c1')).toBe(true)
      expect(getState().pinnedClasses.has('c2')).toBe(true)
    })
  })

  describe('togglePinMember', () => {
    it('pins a member and auto-pins its parent class', async () => {
      const member = { id: 'm1', name: 'doStuff', qualifiedName: 'c1::doStuff', kind: 'member_function' as any, location: { file: 'test.cpp', line: 5, column: 0 } }

      getState().togglePinMember(member, 'c1')

      const { pinnedMembers } = getState()
      expect(pinnedMembers.size).toBe(1)
      expect(pinnedMembers.get('m1')!.classId).toBe('c1')
      expect(pinnedMembers.get('m1')!.member.name).toBe('doStuff')

      // Parent class should be auto-pinned (async, wait for it)
      await vi.waitFor(() => {
        expect(getState().pinnedClasses.has('c1')).toBe(true)
  })
})

// ============================================================
// Saved Views Tests
// ============================================================

describe('Saved Views', () => {
  beforeEach(() => {
    const initial = defaultTabState()
    useAppStore.setState({
      ...initial,
      isConnected: true,
      dbPath: '/test/db',
      classes: [],
      classFilter: '',
      isLoadingClasses: false,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      tabs: [{ id: 'tab-init', label: 'New Tab', state: defaultTabState() }],
      activeTabId: 'tab-init',
      tabRestoreQueue: new Map(),
      savedViews: { classView: [], callstack: [] },
      activeSidePanel: null,
    })
  })

  // ---- saveCurrentView (class-view) ----

  it('saves a class-view when a class is selected', () => {
    setState({
      selectedClass: {
        id: 'cls-1',
        name: 'MyClass',
        kind: 1,
        members: [],
        bases: [],
        derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      pinnedClasses: new Map([['pc1', { id: 'pc1', name: 'Pinned1' } as any]]),
      pinnedMembers: new Map([['pm1', { member: { id: 'pm1', name: 'method' } as any, classId: 'pc1', className: 'Pinned1' }]]),
    })

    getState().saveCurrentView('class-view')
    const sv = getState().savedViews
    expect(sv.classView).toHaveLength(1)
    expect(sv.classView[0].name).toBe('MyClass')
    expect(sv.classView[0].classId).toBe('cls-1')
    expect(sv.classView[0].type).toBe('view')
    expect(sv.classView[0].viewType).toBe('class-view')
    // Pins should be captured
    expect(sv.classView[0].pinnedClassIds).toEqual(['pc1'])
    expect(sv.classView[0].pinnedMemberEntries).toEqual([{ memberId: 'pm1', classId: 'pc1' }])
    // Should not affect callstack
    expect(sv.callstack).toHaveLength(0)
  })

  it('does not save class-view when no class is selected', () => {
    getState().saveCurrentView('class-view')
    expect(getState().savedViews.classView).toHaveLength(0)
  })

  // ---- saveCurrentView (callstack) ----

  it('saves a callstack view when graph exists', () => {
    setState({
      graph: { nodes: [{ id: 'n1', name: 'func', qualifiedName: 'func', kind: 6 as any, location: { file: 'test.cpp', line: 1, column: 1 } }], edges: [] },
      tabs: [{ id: 'tab-init', label: 'My Callstack', state: defaultTabState() }],
      activeTabId: 'tab-init',
      pinnedClasses: new Map([['pc1', { id: 'pc1', name: 'Pinned1' } as any]]),
      pinnedMembers: new Map(),
    })

    getState().saveCurrentView('callstack')
    const sv = getState().savedViews
    expect(sv.callstack).toHaveLength(1)
    expect(sv.callstack[0].graph).toBeDefined()
    expect(sv.callstack[0].viewType).toBe('callstack')
    expect(sv.callstack[0].pinnedClassIds).toEqual(['pc1'])
    expect(sv.callstack[0].pinnedMemberEntries).toEqual([])
    expect(sv.classView).toHaveLength(0)
  })

  // ---- renameSavedView ----

  it('renames a saved view node', () => {
    setState({
      savedViews: {
        classView: [{ id: 'sv-1', name: 'Old Name', type: 'view', viewType: 'class-view', classId: 'c1' }],
        callstack: [],
      },
    })

    getState().renameSavedView('sv-1', 'New Name')
    expect(getState().savedViews.classView[0].name).toBe('New Name')
  })

  it('renames a node nested inside a folder', () => {
    setState({
      savedViews: {
        classView: [{
          id: 'folder-1', name: 'My Folder', type: 'folder',
          children: [{ id: 'sv-deep', name: 'Deep View', type: 'view', viewType: 'class-view', classId: 'c1' }],
        }],
        callstack: [],
      },
    })

    getState().renameSavedView('sv-deep', 'Renamed Deep')
    const folder = getState().savedViews.classView[0]
    expect(folder.children![0].name).toBe('Renamed Deep')
  })

  it('renames linked active tab when its saved view is renamed', () => {
    setState({
      savedViewId: 'sv-1',
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', label: 'Old Name', state: { savedViewId: 'sv-1' } as any }],
      savedViews: {
        classView: [{ id: 'sv-1', name: 'Old Name', type: 'view', viewType: 'class-view', classId: 'c1' }],
        callstack: [],
      },
    })

    getState().renameSavedView('sv-1', 'Shiny New Name')
    expect(getState().tabs.find(t => t.id === 'tab-1')!.label).toBe('Shiny New Name')
  })

  it('renames linked background tab when its saved view is renamed', () => {
    setState({
      savedViewId: null,
      activeTabId: 'tab-active',
      tabs: [
        { id: 'tab-active', label: 'Active', state: { savedViewId: null } as any },
        { id: 'tab-bg', label: 'Old BG Name', state: { savedViewId: 'sv-bg' } as any },
      ],
      savedViews: {
        classView: [{ id: 'sv-bg', name: 'Old BG Name', type: 'view', viewType: 'class-view', classId: 'c2' }],
        callstack: [],
      },
    })

    getState().renameSavedView('sv-bg', 'Renamed BG')
    expect(getState().tabs.find(t => t.id === 'tab-bg')!.label).toBe('Renamed BG')
    expect(getState().tabs.find(t => t.id === 'tab-active')!.label).toBe('Active')
  })

  // ---- deleteSavedView ----

  it('deletes a saved view from the tree', () => {
    setState({
      savedViews: {
        classView: [
          { id: 'sv-1', name: 'Keep', type: 'view', viewType: 'class-view', classId: 'c1' },
          { id: 'sv-2', name: 'Delete Me', type: 'view', viewType: 'class-view', classId: 'c2' },
        ],
        callstack: [],
      },
    })

    getState().deleteSavedView('sv-2')
    const sv = getState().savedViews.classView
    expect(sv).toHaveLength(1)
    expect(sv[0].id).toBe('sv-1')
  })

  it('deletes a folder and its children', () => {
    setState({
      savedViews: {
        classView: [{
          id: 'folder-1', name: 'Folder', type: 'folder',
          children: [{ id: 'sv-child', name: 'Child', type: 'view', viewType: 'class-view', classId: 'c1' }],
        }],
        callstack: [],
      },
    })

    getState().deleteSavedView('folder-1')
    expect(getState().savedViews.classView).toHaveLength(0)
  })

  // ---- createSavedViewFolder ----

  it('creates a folder at root level', () => {
    getState().createSavedViewFolder('class-view', undefined, 'My Folder')
    const sv = getState().savedViews.classView
    expect(sv).toHaveLength(1)
    expect(sv[0].type).toBe('folder')
    expect(sv[0].name).toBe('My Folder')
    expect(sv[0].children).toEqual([])
  })

  it('creates a subfolder inside an existing folder', () => {
    setState({
      savedViews: {
        classView: [{ id: 'folder-1', name: 'Parent', type: 'folder', children: [] }],
        callstack: [],
      },
    })

    getState().createSavedViewFolder('class-view', 'folder-1', 'Sub Folder')
    const parent = getState().savedViews.classView[0]
    expect(parent.children).toHaveLength(1)
    expect(parent.children![0].name).toBe('Sub Folder')
    expect(parent.children![0].type).toBe('folder')
  })

  // ---- moveSavedView ----

  it('moves a view into a folder', () => {
    setState({
      savedViews: {
        classView: [
          { id: 'sv-1', name: 'MyView', type: 'view', viewType: 'class-view', classId: 'c1' },
          { id: 'folder-1', name: 'Target', type: 'folder', children: [] },
        ],
        callstack: [],
      },
    })

    getState().moveSavedView('sv-1', 'folder-1')
    const sv = getState().savedViews.classView
    expect(sv).toHaveLength(1) // only folder remains at root
    expect(sv[0].id).toBe('folder-1')
    expect(sv[0].children).toHaveLength(1)
    expect(sv[0].children![0].id).toBe('sv-1')
  })

  it('moves a view to root level (out of folder)', () => {
    setState({
      savedViews: {
        classView: [{
          id: 'folder-1', name: 'Folder', type: 'folder',
          children: [{ id: 'sv-1', name: 'Nested', type: 'view', viewType: 'class-view', classId: 'c1' }],
        }],
        callstack: [],
      },
    })

    getState().moveSavedView('sv-1', null, 'class-view')
    const sv = getState().savedViews.classView
    expect(sv).toHaveLength(2) // folder + view at root
    expect(sv[1].id).toBe('sv-1')
    expect(sv[0].children).toHaveLength(0)
  })

  // ---- openSavedView (class-view) ----

  it('opens a class-view saved view in a new tab', async () => {
    setState({
      savedViews: {
        classView: [{ id: 'sv-1', name: 'MyClass', type: 'view', viewType: 'class-view', classId: 'cls-1' }],
        callstack: [],
      },
    })

    const tabsBefore = getState().tabs.length
    await getState().openSavedView('sv-1')
    expect(getState().tabs.length).toBe(tabsBefore + 1)
  })

  // ---- openSavedView (callstack) ----

  it('opens a callstack saved view in a new tab with graph', async () => {
    const graph = { nodes: [{ id: 'n1', name: 'fn', qualifiedName: 'fn', kind: 6 as any, location: { file: 'test.cpp', line: 1, column: 1 } }], edges: [] }
    setState({
      savedViews: {
        classView: [],
        callstack: [{ id: 'sv-cs', name: 'Trace', type: 'view', viewType: 'callstack', graph }],
      },
    })

    await getState().openSavedView('sv-cs')
    expect(getState().graph).toEqual(graph)
    expect(getState().tabs.length).toBe(2) // original + new
  })

  it('opens a class-view saved view and restores pins', async () => {
    const pinnedClass = {
      id: 'pc1', name: 'PinnedClass', kind: 1,
      members: [{ id: 'pm1', name: 'method', kind: 6, location: { file: 'test.cpp', line: 10, column: 1 } }],
      bases: [], derived: [],
      location: { file: 'test.cpp', line: 1, column: 1 },
    }

    setState({
      savedViews: {
        classView: [{
          id: 'sv-pin', name: 'WithPins', type: 'view', viewType: 'class-view',
          classId: 'cls-1',
          pinnedClassIds: ['pc1'],
          pinnedMemberEntries: [{ memberId: 'pm1', classId: 'pc1' }],
        }],
        callstack: [],
      },
    })

    // Temporarily extend the mock to also return our pinned class
    const mockGetClassDetail = vi.mocked(apiModule.getClassDetail)
    const originalImpl = mockGetClassDetail.getMockImplementation()!
    mockGetClassDetail.mockImplementation(async (id: string) => {
      if (id === 'pc1') return pinnedClass as any
      return originalImpl(id)
    })

    await getState().openSavedView('sv-pin')

    expect(getState().pinnedClasses.size).toBe(1)
    expect(getState().pinnedClasses.has('pc1')).toBe(true)
    expect(getState().pinnedMembers.size).toBe(1)
    expect(getState().pinnedMembers.has('pm1')).toBe(true)
    expect(getState().pinnedMembers.get('pm1')!.className).toBe('PinnedClass')

    // Restore original mock
    mockGetClassDetail.mockImplementation(originalImpl)
  })

  it('opens a callstack saved view and restores pins', async () => {
    const graph = { nodes: [{ id: 'n1', name: 'fn', qualifiedName: 'fn', kind: 6 as any, location: { file: 'test.cpp', line: 1, column: 1 } }], edges: [] }
    const pinnedClass = {
      id: 'pc2', name: 'AnotherPinned', kind: 1,
      members: [], bases: [], derived: [],
      location: { file: 'test.cpp', line: 1, column: 1 },
    }

    setState({
      savedViews: {
        classView: [],
        callstack: [{
          id: 'sv-cs-pin', name: 'TraceWithPins', type: 'view', viewType: 'callstack',
          graph,
          pinnedClassIds: ['pc2'],
          pinnedMemberEntries: [],
        }],
      },
    })

    const mockGetClassDetail = vi.mocked(apiModule.getClassDetail)
    const originalImpl = mockGetClassDetail.getMockImplementation()!
    mockGetClassDetail.mockImplementation(async (id: string) => {
      if (id === 'pc2') return pinnedClass as any
      return originalImpl(id)
    })

    await getState().openSavedView('sv-cs-pin')

    expect(getState().graph).toEqual(graph)
    expect(getState().pinnedClasses.size).toBe(1)
    expect(getState().pinnedClasses.has('pc2')).toBe(true)
    expect(getState().pinnedMembers.size).toBe(0)

    // Restore original mock
    mockGetClassDetail.mockImplementation(originalImpl)
  })

  // ---- activeSidePanel ----

  it('toggles active side panel', () => {
    expect(getState().activeSidePanel).toBeNull()
    getState().setActiveSidePanel('saved-views')
    expect(getState().activeSidePanel).toBe('saved-views')
    getState().setActiveSidePanel(null)
    expect(getState().activeSidePanel).toBeNull()
  })

  // ---- Persistence (savedViews in session) ----

  it('includes savedViews in serialized session', () => {
    setState({
      savedViews: {
        classView: [{ id: 'sv-1', name: 'ClassA', type: 'view', viewType: 'class-view', classId: 'c1' }],
        callstack: [],
      },
    })

    const state = getState()
    const session = serializeSession(
      'vs-browse-db',
      '/test/db',
      state.activeTabId!,
      captureTabState(state),
      state.tabs,
      state.tabRestoreQueue,
      state.savedViews,
    )
    expect(session.savedViews).toBeDefined()
    expect(session.savedViews!.classView).toHaveLength(1)
    expect(session.savedViews!.classView[0].classId).toBe('c1')
  })
})

// ============================================================
// Tab-SavedView Linkage Tests
// ============================================================

describe('Tab-SavedView Linkage', () => {
  beforeEach(() => {
    const initial = defaultTabState()
    useAppStore.setState({
      ...initial,
      isConnected: true,
      dbPath: '/test/db',
      classes: [],
      classFilter: '',
      isLoadingClasses: false,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      tabs: [{ id: 'tab-init', label: 'New Tab', state: defaultTabState() }],
      activeTabId: 'tab-init',
      tabRestoreQueue: new Map(),
      savedViews: { classView: [], callstack: [] },
      activeSidePanel: null,
    })
  })

  it('saveCurrentView links the tab to the new saved view', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
    })

    getState().saveCurrentView('class-view')
    const sv = getState().savedViews
    expect(sv.classView).toHaveLength(1)
    // Tab should now be linked
    expect(getState().savedViewId).toBe(sv.classView[0].id)
  })

  it('isTabDirty returns false when tab matches saved view', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      pinnedClasses: new Map(),
      pinnedMembers: new Map(),
    })

    getState().saveCurrentView('class-view')
    expect(isTabDirty(getState())).toBe(false)
  })

  it('isTabDirty returns true when pins change', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      pinnedClasses: new Map(),
      pinnedMembers: new Map(),
    })

    getState().saveCurrentView('class-view')
    expect(isTabDirty(getState())).toBe(false)

    // Add a pinned class — should become dirty
    setState({
      pinnedClasses: new Map([['pc1', { id: 'pc1', name: 'Pinned' } as any]]),
    })
    expect(isTabDirty(getState())).toBe(true)
  })

  it('isTabDirty returns true when selected class changes', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
    })

    getState().saveCurrentView('class-view')
    expect(isTabDirty(getState())).toBe(false)

    // Navigate to different class
    setState({
      selectedClass: {
        id: 'cls-2', name: 'Other', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
    })
    expect(isTabDirty(getState())).toBe(true)
  })

  it('isTabDirty returns false when no savedViewId', () => {
    setState({ savedViewId: null })
    expect(isTabDirty(getState())).toBe(false)
  })

  it('updateSavedView updates the linked view with current state', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      pinnedClasses: new Map(),
      pinnedMembers: new Map(),
    })

    getState().saveCurrentView('class-view')
    const viewId = getState().savedViewId!

    // Modify state (add a pin)
    setState({
      pinnedClasses: new Map([['pc1', { id: 'pc1', name: 'Pinned' } as any]]),
    })
    expect(isTabDirty(getState())).toBe(true)

    // Update the saved view
    getState().updateSavedView(viewId)

    // Should no longer be dirty
    expect(isTabDirty(getState())).toBe(false)
    // Saved view should have the new pin
    const node = getState().savedViews.classView[0]
    expect(node.pinnedClassIds).toEqual(['pc1'])
  })

  it('saveOrUpdateView updates existing linked view', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      pinnedClasses: new Map(),
      pinnedMembers: new Map(),
    })

    getState().saveCurrentView('class-view')
    const viewId = getState().savedViewId!
    expect(getState().savedViews.classView).toHaveLength(1)

    // Modify and save again via saveOrUpdateView
    setState({
      pinnedClasses: new Map([['pc1', { id: 'pc1', name: 'Pinned' } as any]]),
    })
    getState().saveOrUpdateView()

    // Should still be only 1 saved view (updated, not a new one)
    expect(getState().savedViews.classView).toHaveLength(1)
    expect(getState().savedViews.classView[0].id).toBe(viewId)
    expect(getState().savedViews.classView[0].pinnedClassIds).toEqual(['pc1'])
  })

  it('saveOrUpdateView creates new view when not linked', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
      savedViewId: null,
    })

    getState().saveOrUpdateView()
    expect(getState().savedViews.classView).toHaveLength(1)
    expect(getState().savedViewId).toBe(getState().savedViews.classView[0].id)
  })

  it('openSavedView jumps to existing linked tab instead of creating new', async () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
    })

    getState().saveCurrentView('class-view')
    const viewId = getState().savedViewId!
    const linkedTabId = getState().activeTabId!

    // Create another tab
    await getState().createTab()
    const newTabId = getState().activeTabId!
    expect(newTabId).not.toBe(linkedTabId)

    // Double-click saved view — should switch to the linked tab, not create a new one
    const tabCountBefore = getState().tabs.length
    await getState().openSavedView(viewId)
    expect(getState().activeTabId).toBe(linkedTabId)
    expect(getState().tabs.length).toBe(tabCountBefore) // no new tab
  })

  it('openSavedView creates new tab when no linked tab exists', async () => {
    setState({
      savedViews: {
        classView: [{ id: 'sv-orphan', name: 'Orphan', type: 'view', viewType: 'class-view', classId: 'cls-1' }],
        callstack: [],
      },
    })

    const tabCountBefore = getState().tabs.length
    await getState().openSavedView('sv-orphan')
    expect(getState().tabs.length).toBe(tabCountBefore + 1)
    // New tab should be linked to the saved view
    expect(getState().savedViewId).toBe('sv-orphan')
  })

  it('savedViewId is preserved in session serialization', () => {
    setState({
      selectedClass: {
        id: 'cls-1', name: 'MyClass', kind: 1, members: [], bases: [], derived: [],
        location: { file: 'test.cpp', line: 1, column: 1 },
      } as any,
    })

    getState().saveCurrentView('class-view')
    const viewId = getState().savedViewId

    const state = getState()
    const session = serializeSession(
      'vs-browse-db', '/test/db', state.activeTabId!, captureTabState(state), state.tabs,
      state.tabRestoreQueue, state.savedViews,
    )
    expect(session.tabs[0].savedViewId).toBe(viewId)
  })
})

    it('unpins a previously pinned member', () => {
      const member = { id: 'm1', name: 'doStuff', qualifiedName: 'c1::doStuff', kind: 'member_function' as any, location: { file: 'test.cpp', line: 5, column: 0 } }

      getState().togglePinMember(member, 'c1')
      expect(getState().pinnedMembers.size).toBe(1)

      getState().togglePinMember(member, 'c1')
      expect(getState().pinnedMembers.size).toBe(0)
    })

    it('does not duplicate parent class if already pinned', async () => {
      await getState().togglePinClass('c1')
      expect(getState().pinnedClasses.size).toBe(1)

      const member = { id: 'm1', name: 'doStuff', qualifiedName: 'c1::doStuff', kind: 'member_function' as any, location: { file: 'test.cpp', line: 5, column: 0 } }
      getState().togglePinMember(member, 'c1')

      // Still just 1 pinned class
      expect(getState().pinnedClasses.size).toBe(1)
      expect(getState().pinnedMembers.size).toBe(1)
    })
  })

  describe('unpinAll', () => {
    it('clears all pinned classes and members', async () => {
      await getState().togglePinClass('c1')
      await getState().togglePinClass('c2')
      const member = { id: 'm1', name: 'field', qualifiedName: 'c1::field', kind: 'member' as any, location: { file: 'test.cpp', line: 1, column: 0 } }
      getState().togglePinMember(member, 'c1')

      expect(getState().pinnedClasses.size).toBe(2)
      expect(getState().pinnedMembers.size).toBe(1)

      getState().unpinAll()

      expect(getState().pinnedClasses.size).toBe(0)
      expect(getState().pinnedMembers.size).toBe(0)
    })
  })

  describe('navigation preserves pins', () => {
    it('selectClass does not clear pinned state', async () => {
      await getState().togglePinClass('c1')
      const member = { id: 'm1', name: 'field', qualifiedName: 'c1::field', kind: 'member' as any, location: { file: 'test.cpp', line: 1, column: 0 } }
      getState().togglePinMember(member, 'c1')

      // Navigate to another class
      await getState().selectClass('c2')

      // Pins should survive
      expect(getState().pinnedClasses.size).toBe(1)
      expect(getState().pinnedClasses.has('c1')).toBe(true)
      expect(getState().pinnedMembers.size).toBe(1)
    })

    it('goBack does not clear pinned state', async () => {
      await getState().selectClass('c1')
      await getState().togglePinClass('c1')

      await getState().selectClass('c2')
      await getState().goBack()

      expect(getState().pinnedClasses.has('c1')).toBe(true)
    })

    it('pins survive tab switch round-trip', async () => {
      await getState().togglePinClass('c1')
      expect(getState().pinnedClasses.has('c1')).toBe(true)

      // Create a new tab (saves current tab state)
      await getState().createTab()
      const newTabId = getState().activeTabId!

      // New tab should start with empty pins
      expect(getState().pinnedClasses.size).toBe(0)

      // Switch back to original tab
      getState().switchTab('pin-test-tab')
      expect(getState().pinnedClasses.has('c1')).toBe(true)

      // Clean up: switch back and close
      getState().switchTab(newTabId)
      getState().closeTab(newTabId)
    })
  })
})

// ============================================================
// Session Persistence Tests
// ============================================================

describe('Session Serializer', () => {
  it('buildSessionKey produces consistent keys', () => {
    const key = buildSessionKey('vs-browse-db', '/path/to/db')
    expect(key).toBe('vs-browse-db:/path/to/db')
  })

  it('serializeTab extracts IDs from live state', () => {
    const state: any = {
      ...defaultTabState(),
      selectedClass: { id: 'c1', name: 'Foo' },
      selectedMember: { id: 'm1', name: 'bar' },
      selectedMembers: new Set(['m1', 'm2']),
      pinnedClasses: new Map([['c1', { id: 'c1', name: 'Foo' }]]),
      pinnedMembers: new Map([
        ['m1', { member: { id: 'm1', name: 'bar' }, classId: 'c1', className: 'Foo' }],
      ]),
      navBackStack: ['c0'],
      navForwardStack: ['c2'],
      leftPanelOpen: false,
    }

    const serialized = serializeTab('tab-1', 'Foo', state)

    expect(serialized.id).toBe('tab-1')
    expect(serialized.label).toBe('Foo')
    expect(serialized.selectedClassId).toBe('c1')
    expect(serialized.selectedMemberId).toBe('m1')
    expect(serialized.selectedMemberIds).toEqual(['m1', 'm2'])
    expect(serialized.pinnedClassIds).toEqual(['c1'])
    expect(serialized.pinnedMemberEntries).toEqual([{ memberId: 'm1', classId: 'c1' }])
    expect(serialized.navBackStack).toEqual(['c0'])
    expect(serialized.navForwardStack).toEqual(['c2'])
    expect(serialized.leftPanelOpen).toBe(false)
  })

  it('serializeTab handles empty state', () => {
    const state = defaultTabState()
    const serialized = serializeTab('tab-1', 'New Tab', state)

    expect(serialized.selectedClassId).toBeNull()
    expect(serialized.selectedMemberId).toBeNull()
    expect(serialized.selectedMemberIds).toEqual([])
    expect(serialized.pinnedClassIds).toEqual([])
    expect(serialized.pinnedMemberEntries).toEqual([])
  })

  it('serializeSession produces complete SessionData', () => {
    const activeState: any = {
      ...defaultTabState(),
      selectedClass: { id: 'c1', name: 'Foo' },
    }
    const tabs: any[] = [
      { id: 'tab-1', label: 'Foo', state: activeState },
      { id: 'tab-2', label: 'Bar', state: defaultTabState() },
    ]

    const result = serializeSession(
      'vs-browse-db', '/test/db', 'tab-1', activeState, tabs
    )

    expect(result.version).toBe(CURRENT_SESSION_VERSION)
    expect(result.pluginName).toBe('vs-browse-db')
    expect(result.dataPath).toBe('/test/db')
    expect(result.activeTabId).toBe('tab-1')
    expect(result.tabs).toHaveLength(2)
    expect(result.tabs[0].selectedClassId).toBe('c1')
    expect(result.tabs[1].selectedClassId).toBeNull()
    expect(result.savedAt).toBeTruthy()
  })
})

describe('Session Restore', () => {
  const mockApi = vi.mocked(apiModule)

  beforeEach(() => {
    const initial = defaultTabState()
    useAppStore.setState({
      ...initial,
      isConnected: false,
      dbPath: null,
      classes: [],
      classFilter: '',
      isLoadingClasses: false,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      tabs: [{ id: 'tab-init', label: 'New Tab', state: defaultTabState() }],
      activeTabId: 'tab-init',
      tabRestoreQueue: new Map(),
    })
    vi.clearAllMocks()
    // Reset default session load to null (no saved session)
    mockApi.sessionLoad.mockResolvedValue(null)
  })

  it('openDatabase with no saved session creates fresh tab', async () => {
    await getState().openDatabase('/test/db')

    expect(getState().isConnected).toBe(true)
    expect(getState().dbPath).toBe('/test/db')
    expect(getState().tabs).toHaveLength(1)
    expect(getState().tabRestoreQueue.size).toBe(0)
  })

  it('openDatabase with saved session restores tabs', async () => {
    const savedSession: SessionData = {
      version: CURRENT_SESSION_VERSION,
      pluginName: 'vs-browse-db',
      dataPath: '/test/db',
      savedAt: new Date().toISOString(),
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          label: 'ClassA',
          selectedClassId: 'c1',
          selectedMemberId: null,
          selectedMemberIds: [],
          pinnedClassIds: [],
          pinnedMemberEntries: [],
          navBackStack: [],
          navForwardStack: [],
          leftPanelOpen: true,
          savedViewId: null,
        },
        {
          id: 'tab-2',
          label: 'ClassB',
          selectedClassId: 'c2',
          selectedMemberId: null,
          selectedMemberIds: [],
          pinnedClassIds: [],
          pinnedMemberEntries: [],
          navBackStack: ['c1'],
          navForwardStack: [],
          leftPanelOpen: true,
          savedViewId: null,
        },
      ],
    }

    mockApi.sessionLoad.mockResolvedValue(savedSession)

    await getState().openDatabase('/test/db')

    expect(getState().isConnected).toBe(true)
    expect(getState().tabs).toHaveLength(2)
    // Active tab should be rehydrated
    expect(getState().selectedClass?.id).toBe('c1')
    expect(getState().selectedClass?.name).toBe('Class_c1')
    // Background tab stays in restore queue
    expect(getState().tabRestoreQueue.has('tab-2')).toBe(true)
    // Active tab removed from queue
    expect(getState().tabRestoreQueue.has('tab-1')).toBe(false)
  })

  it('restored tabs get rehydrated on switchTab', async () => {
    const savedSession: SessionData = {
      version: CURRENT_SESSION_VERSION,
      pluginName: 'vs-browse-db',
      dataPath: '/test/db',
      savedAt: new Date().toISOString(),
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          label: 'ClassA',
          selectedClassId: 'c1',
          selectedMemberId: null,
          selectedMemberIds: [],
          pinnedClassIds: [],
          pinnedMemberEntries: [],
          navBackStack: [],
          navForwardStack: [],
          leftPanelOpen: true,
          savedViewId: null,
        },
        {
          id: 'tab-2',
          label: 'ClassB',
          selectedClassId: 'c2',
          selectedMemberId: null,
          selectedMemberIds: [],
          pinnedClassIds: [],
          pinnedMemberEntries: [],
          navBackStack: ['c1'],
          navForwardStack: [],
          leftPanelOpen: false,
          savedViewId: null,
        },
      ],
    }

    mockApi.sessionLoad.mockResolvedValue(savedSession)
    await getState().openDatabase('/test/db')

    // tab-2 should be in restore queue
    expect(getState().tabRestoreQueue.has('tab-2')).toBe(true)

    // Switch to tab-2 — triggers lazy rehydration
    getState().switchTab('tab-2')

    // Wait for async rehydration
    await vi.waitFor(() => {
      expect(getState().selectedClass?.id).toBe('c2')
    })

    expect(getState().leftPanelOpen).toBe(false)
    expect(getState().navBackStack).toEqual(['c1'])
    expect(getState().tabRestoreQueue.has('tab-2')).toBe(false)
  })

  it('restores pinned classes and members', async () => {
    // Set up getClassDetail to return members for class c1
    mockApi.getClassDetail.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: `Class_${id}`,
        kind: 1,
        members: [
          { id: `${id}-m1`, name: 'field1', qualifiedName: `${id}::field1`, kind: 'member', location: { file: 'test.cpp', line: 5, column: 0 } },
          { id: `${id}-m2`, name: 'field2', qualifiedName: `${id}::field2`, kind: 'member', location: { file: 'test.cpp', line: 6, column: 0 } },
        ],
        bases: [],
        derived: [],
        location: { file: 'test.cpp', line: 10, column: 1 },
      } as any)
    )

    const savedSession: SessionData = {
      version: CURRENT_SESSION_VERSION,
      pluginName: 'vs-browse-db',
      dataPath: '/test/db',
      savedAt: new Date().toISOString(),
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        label: 'ClassA',
        selectedClassId: 'c1',
        selectedMemberId: 'c1-m1',
        selectedMemberIds: ['c1-m1'],
        pinnedClassIds: ['c1', 'c2'],
        pinnedMemberEntries: [{ memberId: 'c2-m1', classId: 'c2' }],
        navBackStack: [],
        navForwardStack: [],
        leftPanelOpen: true,
        savedViewId: null,
      }],
    }

    mockApi.sessionLoad.mockResolvedValue(savedSession)
    await getState().openDatabase('/test/db')

    // Selected class and member should be restored
    expect(getState().selectedClass?.id).toBe('c1')
    expect(getState().selectedMember?.id).toBe('c1-m1')
    expect(getState().selectedMembers.has('c1-m1')).toBe(true)

    // Pinned classes should be restored
    expect(getState().pinnedClasses.size).toBe(2)
    expect(getState().pinnedClasses.has('c1')).toBe(true)
    expect(getState().pinnedClasses.has('c2')).toBe(true)

    // Pinned members should be restored from parent class members
    expect(getState().pinnedMembers.size).toBe(1)
    expect(getState().pinnedMembers.has('c2-m1')).toBe(true)
    expect(getState().pinnedMembers.get('c2-m1')!.classId).toBe('c2')
  })

  it('auto-save triggers on state change (debounced)', async () => {
    // Open DB first (no saved session)
    await getState().openDatabase('/test/db')

    // Make a state change that would trigger save
    await getState().selectClass('c1')

    // Wait for debounce (2s) + some buffer
    await new Promise(r => setTimeout(r, 2500))

    expect(mockApi.sessionSave).toHaveBeenCalled()
    const [key, data] = mockApi.sessionSave.mock.calls[mockApi.sessionSave.mock.calls.length - 1]
    expect(key).toBe('vs-browse-db:/test/db')
    expect(data.tabs).toBeDefined()
    expect(data.version).toBe(CURRENT_SESSION_VERSION)
  }, 10000)

  it('nextTabId is advanced past restored IDs to avoid collision', async () => {
    const savedSession: SessionData = {
      version: CURRENT_SESSION_VERSION,
      pluginName: 'vs-browse-db',
      dataPath: '/test/db',
      savedAt: new Date().toISOString(),
      activeTabId: 'tab-50',
      tabs: [{
        id: 'tab-50',
        label: 'ClassA',
        selectedClassId: 'c1',
        selectedMemberId: null,
        selectedMemberIds: [],
        pinnedClassIds: [],
        pinnedMemberEntries: [],
        navBackStack: [],
        navForwardStack: [],
        leftPanelOpen: true,
        savedViewId: null,
      }],
    }

    mockApi.sessionLoad.mockResolvedValue(savedSession)
    await getState().openDatabase('/test/db')

    // Create a new tab — its ID should not collide with tab-50
    await getState().createTab()
    const newId = getState().activeTabId!
    const num = parseInt(newId.replace('tab-', ''), 10)
    expect(num).toBeGreaterThan(50)
  })
})
