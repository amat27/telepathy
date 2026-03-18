// ============================================================
// Tab management tests for appStore
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore, defaultTabState, captureTabState } from '../appStore'

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
  searchSymbols: vi.fn().mockResolvedValue([]),
  getSourceSnippet: vi.fn().mockResolvedValue('10: void foo() {'),
}))

function getState() {
  return useAppStore.getState()
}

function setState(partial: Parameters<typeof useAppStore.setState>[0]) {
  useAppStore.setState(partial)
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
})
