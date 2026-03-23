// ============================================================
// Telepathy - Main UI Store (Zustand)
// Supports multiple class tabs with swap-in/swap-out pattern
// ============================================================

import { create } from 'zustand'
import type { CodeSymbol, CodeGraph, SymbolSummary, SymbolEdge, TabState, TabInfo } from '../types/model'
import { EdgeKind, SymbolKind } from '../types/model'
import * as api from '../api'
import { parseCallstack, resolveCallstack } from '../utils/callstackParser'

// ---- Tab helpers ----

let nextTabId = 1

function generateTabId(): string {
  return `tab-${nextTabId++}`
}

export function defaultTabState(): TabState {
  return {
    selectedClass: null,
    previewedClass: null,
    isLoadingDetail: false,
    selectedMember: null,
    selectedMembers: new Set<string>(),
    graph: null,
    isLoadingGraph: false,
    sourceCode: '',
    sourceFile: null,
    sourceLine: 0,
    navBackStack: [],
    navForwardStack: [],
    leftPanelOpen: true,
  }
}

/** Extract per-tab fields from flat store state */
export function captureTabState(state: AppState): TabState {
  return {
    selectedClass: state.selectedClass,
    previewedClass: state.previewedClass,
    isLoadingDetail: state.isLoadingDetail,
    selectedMember: state.selectedMember,
    selectedMembers: state.selectedMembers,
    graph: state.graph,
    isLoadingGraph: state.isLoadingGraph,
    sourceCode: state.sourceCode,
    sourceFile: state.sourceFile,
    sourceLine: state.sourceLine,
    navBackStack: state.navBackStack,
    navForwardStack: state.navForwardStack,
    leftPanelOpen: state.leftPanelOpen,
  }
}

// ---- Store interface ----

interface AppState {
  // Connection state
  isConnected: boolean
  dbPath: string | null

  // Class list (left panel)
  classes: SymbolSummary[]
  classFilter: string
  isLoadingClasses: boolean

  // --- Per-tab state (flat, represents active tab) ---
  selectedClass: CodeSymbol | null
  previewedClass: CodeSymbol | null
  isLoadingDetail: boolean
  selectedMember: CodeSymbol | null
  selectedMembers: Set<string>
  graph: CodeGraph | null
  isLoadingGraph: boolean
  sourceCode: string
  sourceFile: string | null
  sourceLine: number
  navBackStack: string[]
  navForwardStack: string[]
  leftPanelOpen: boolean

  // --- Tab management ---
  tabs: TabInfo[]
  activeTabId: string | null

  // Search
  searchQuery: string
  searchResults: SymbolSummary[]
  isSearching: boolean

  // Actions - Global
  openDatabase: (dbPath: string) => Promise<void>
  loadClasses: (filter?: string) => Promise<void>
  search: (query: string) => Promise<void>
  setClassFilter: (filter: string) => void

  // Actions - Tab management
  createTab: (classId?: string) => Promise<void>
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void

  // Actions - Per-tab (operate on active tab)
  selectClass: (classId: string) => Promise<void>
  previewClass: (classId: string) => Promise<void>
  selectMember: (member: CodeSymbol) => Promise<void>
  toggleMember: (member: CodeSymbol) => void
  loadHierarchy: (classId: string) => Promise<void>
  loadSource: (file: string, line: number) => Promise<void>
  loadCallstack: (text: string) => void
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  setLeftPanelOpen: (open: boolean) => void
}

// ---- Initial tab ----

const initialTabId = generateTabId()
const initialTab: TabInfo = {
  id: initialTabId,
  label: 'New Tab',
  state: defaultTabState(),
}

// ---- Store ----

export const useAppStore = create<AppState>((set, get) => ({
  isConnected: false,
  dbPath: null,

  classes: [],
  classFilter: '',
  isLoadingClasses: false,

  // Per-tab state (flat)
  selectedClass: null,
  previewedClass: null,
  isLoadingDetail: false,
  selectedMember: null,
  selectedMembers: new Set<string>(),
  graph: null,
  isLoadingGraph: false,
  sourceCode: '',
  sourceFile: null,
  sourceLine: 0,
  navBackStack: [],
  navForwardStack: [],
  leftPanelOpen: true,

  // Tabs
  tabs: [initialTab],
  activeTabId: initialTabId,

  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // ---- Global actions ----

  openDatabase: async (dbPath: string) => {
    try {
      await api.initPlugin('vs-browse-db', dbPath)
      // Reset to a single fresh tab
      const freshTabId = generateTabId()
      const freshTab: TabInfo = {
        id: freshTabId,
        label: 'New Tab',
        state: defaultTabState(),
      }
      set({
        isConnected: true,
        dbPath,
        tabs: [freshTab],
        activeTabId: freshTabId,
        ...defaultTabState(),
      })
      await get().loadClasses()
    } catch (err) {
      console.error('Failed to open database:', err)
      throw err
    }
  },

  loadClasses: async (filter?: string) => {
    set({ isLoadingClasses: true })
    try {
      const classes = await api.getClasses(filter)
      set({ classes, isLoadingClasses: false })
    } catch (err) {
      console.error('Failed to load classes:', err)
      set({ isLoadingClasses: false })
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query, isSearching: true })
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false })
      return
    }
    try {
      const searchResults = await api.searchSymbols(query, undefined, 50)
      set({ searchResults, isSearching: false })
    } catch (err) {
      console.error('Search failed:', err)
      set({ isSearching: false })
    }
  },

  setClassFilter: (filter: string) => {
    set({ classFilter: filter })
    get().loadClasses(filter || undefined)
  },

  // ---- Tab management actions ----

  createTab: async (classId?: string) => {
    const state = get()
    const currentTabId = state.activeTabId

    // Save current active tab's state
    if (currentTabId) {
      const currentState = captureTabState(state)
      set({
        tabs: state.tabs.map(t =>
          t.id === currentTabId ? { ...t, state: currentState } : t
        ),
      })
    }

    // Create new tab
    const newTabId = generateTabId()
    const newTab: TabInfo = {
      id: newTabId,
      label: 'New Tab',
      state: defaultTabState(),
    }

    // Restore empty state + add new tab
    set({
      ...defaultTabState(),
      tabs: [...get().tabs, newTab],
      activeTabId: newTabId,
    })

    // Optionally load a class into the new tab
    if (classId) {
      await get().selectClass(classId)
    }
  },

  closeTab: (tabId: string) => {
    const state = get()
    const { tabs, activeTabId } = state

    if (tabs.length <= 1) {
      // Closing the last tab — reset to empty state
      const freshTabId = generateTabId()
      const freshTab: TabInfo = {
        id: freshTabId,
        label: 'New Tab',
        state: defaultTabState(),
      }
      set({
        tabs: [freshTab],
        activeTabId: freshTabId,
        ...defaultTabState(),
      })
      return
    }

    // Find adjacent tab to switch to
    const closingIndex = tabs.findIndex(t => t.id === tabId)
    if (closingIndex === -1) return

    const remainingTabs = tabs.filter(t => t.id !== tabId)

    if (tabId === activeTabId) {
      // Switching to an adjacent tab
      const newActiveIndex = Math.min(closingIndex, remainingTabs.length - 1)
      const newActive = remainingTabs[newActiveIndex]
      set({
        tabs: remainingTabs,
        activeTabId: newActive.id,
        // Restore the new active tab's state, clearing stale loading flags
        ...newActive.state,
        isLoadingDetail: false,
        isLoadingGraph: false,
      })
    } else {
      // Closing a background tab — no state change needed
      set({ tabs: remainingTabs })
    }
  },

  switchTab: (tabId: string) => {
    const state = get()
    if (tabId === state.activeTabId) return

    const targetTab = state.tabs.find(t => t.id === tabId)
    if (!targetTab) return

    // Save current active tab's state
    const currentState = captureTabState(state)
    const updatedTabs = state.tabs.map(t =>
      t.id === state.activeTabId ? { ...t, state: currentState } : t
    )

    // Restore target tab's state, clearing stale loading flags
    set({
      ...targetTab.state,
      isLoadingDetail: false,
      isLoadingGraph: false,
      tabs: updatedTabs,
      activeTabId: tabId,
    })
  },

  // ---- Per-tab actions ----

  selectClass: async (classId: string) => {
    const myTabId = get().activeTabId

    // Push current class to back stack (for navigation)
    const currentId = get().selectedClass?.id
    if (currentId && currentId !== classId) {
      set(s => ({
        navBackStack: [...s.navBackStack, currentId],
        navForwardStack: [],
      }))
    }

    set({ isLoadingDetail: true, isLoadingGraph: true, selectedMember: null, selectedMembers: new Set(), previewedClass: null })

    // Update tab label optimistically
    set(s => ({
      tabs: s.tabs.map(t =>
        t.id === myTabId ? { ...t, label: `Loading...` } : t
      ),
    }))

    try {
      const [detail, graph] = await Promise.all([
        api.getClassDetail(classId),
        api.getClassHierarchy(classId),
      ])

      // Guard: if user switched tabs while loading, discard
      if (get().activeTabId !== myTabId) return

      set(s => ({
        selectedClass: detail,
        graph,
        isLoadingDetail: false,
        isLoadingGraph: false,
        tabs: s.tabs.map(t =>
          t.id === myTabId ? { ...t, label: detail?.name ?? 'New Tab' } : t
        ),
      }))

      // Auto-load source code
      if (detail?.location) {
        if (get().activeTabId !== myTabId) return
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to load class detail:', err)
      if (get().activeTabId !== myTabId) return
      set(s => ({
        isLoadingDetail: false,
        isLoadingGraph: false,
        tabs: s.tabs.map(t =>
          t.id === myTabId ? { ...t, label: 'Error' } : t
        ),
      }))
    }
  },

  selectMember: async (member: CodeSymbol) => {
    const myTabId = get().activeTabId
    set({ selectedMember: member })
    if (member.location) {
      if (get().activeTabId !== myTabId) return
      await get().loadSource(member.location.file, member.location.line)
    }
  },

  // Preview a class without navigating (updates right panel only, preserves graph)
  previewClass: async (classId: string) => {
    const myTabId = get().activeTabId
    try {
      const detail = await api.getClassDetail(classId)
      if (get().activeTabId !== myTabId) return
      set({ previewedClass: detail, selectedMember: null })

      // Load source for the previewed class
      if (detail?.location) {
        if (get().activeTabId !== myTabId) return
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to preview class:', err)
    }
  },

  toggleMember: (member: CodeSymbol) => {
    const prev = get().selectedMembers
    const next = new Set(prev)
    if (next.has(member.id)) {
      next.delete(member.id)
    } else {
      next.add(member.id)
    }
    set({ selectedMembers: next })
  },

  loadHierarchy: async (classId: string) => {
    const myTabId = get().activeTabId
    set({ isLoadingGraph: true })
    try {
      const graph = await api.getClassHierarchy(classId)
      if (get().activeTabId !== myTabId) return
      set({ graph, isLoadingGraph: false })
    } catch (err) {
      console.error('Failed to load hierarchy:', err)
      if (get().activeTabId !== myTabId) return
      set({ isLoadingGraph: false })
    }
  },

  loadSource: async (file: string, line: number) => {
    const myTabId = get().activeTabId
    try {
      const sourceCode = await api.getSourceSnippet(file, line, 30)
      if (get().activeTabId !== myTabId) return
      set({ sourceCode, sourceFile: file, sourceLine: line })
    } catch (err) {
      console.error('Failed to load source:', err)
    }
  },

  loadCallstack: async (text: string) => {
    const myTabId = get().activeTabId
    const entries = parseCallstack(text)
    if (entries.length === 0) return

    // Collect all unique potential class name candidates from entry segments.
    // For segments [s0, s1, ..., sN], try all sub-ranges as possible class names:
    //   s0, s0::s1, s0::s1::s2, ..., s1, s1::s2, etc.
    const candidates = new Set<string>()
    for (const entry of entries) {
      if (!entry.segments || entry.segments.length < 2) continue
      for (let split = entry.segments.length - 1; split >= 1; split--) {
        for (let start = 0; start < split; start++) {
          candidates.add(entry.segments.slice(start, split).join('::'))
        }
      }
    }

    // Search DB for each candidate in parallel, build name→id map
    const classNameMap = new Map<string, string>()
    const searches = [...candidates].map(async (name) => {
      try {
        const results = await api.searchSymbols(name, [SymbolKind.Class, SymbolKind.Struct], 5)
        for (const r of results) {
          if (r.name === name || r.qualifiedName === name) {
            classNameMap.set(name, r.id)
            break // first exact match wins
          }
        }
      } catch { /* ignore search failures */ }
    })
    await Promise.all(searches)

    // Tab may have switched during async search
    if (get().activeTabId !== myTabId) return

    const frames = resolveCallstack(entries, classNameMap)
    if (frames.length === 0) return

    // Reverse: callstacks list frame 0 (callee) first, we want caller-first order
    const callerFirst = [...frames].reverse()

    // Build linear chain: one node per frame, no deduplication
    const nodes: CodeSymbol[] = callerFirst.map((f, i) => ({
      id: `cs-frame-${i}`,
      name: f.label,
      qualifiedName: f.label,
      kind: SymbolKind.Unknown,
      location: { file: '', line: 0, column: 0 },
      typeClassId: f.classId ?? undefined,   // store resolved classId for click handling
    }))

    // Linear edges: frame[i] → frame[i+1]
    const edges: SymbolEdge[] = []
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `cs-edge-${i}`,
        source: nodes[i].id,
        target: nodes[i + 1].id,
        kind: EdgeKind.Calls,
      })
    }

    const graph: CodeGraph = { nodes, edges }

    // Save current active tab state
    const state = get()
    const currentTabId = state.activeTabId
    if (currentTabId) {
      const currentState = captureTabState(state)
      set({
        tabs: state.tabs.map(t =>
          t.id === currentTabId ? { ...t, state: currentState } : t
        ),
      })
    }

    // Create new tab with callstack graph (selectedClass stays null)
    const newTabId = generateTabId()
    const newTab: TabInfo = {
      id: newTabId,
      label: 'Callstack',
      state: defaultTabState(),
    }

    set({
      ...defaultTabState(),
      graph,
      tabs: [...get().tabs, newTab],
      activeTabId: newTabId,
    })
  },

  goBack: async () => {
    const myTabId = get().activeTabId
    const { navBackStack, selectedClass } = get()
    if (navBackStack.length === 0) return
    const prevId = navBackStack[navBackStack.length - 1]
    const currentId = selectedClass?.id

    // Move current to forward stack, pop from back stack
    set(s => ({
      navBackStack: s.navBackStack.slice(0, -1),
      navForwardStack: currentId ? [...s.navForwardStack, currentId] : s.navForwardStack,
    }))

    // Load the class (without pushing to history again)
    set({ isLoadingDetail: true, isLoadingGraph: true, selectedMember: null, selectedMembers: new Set() })
    try {
      const [detail, graph] = await Promise.all([
        api.getClassDetail(prevId),
        api.getClassHierarchy(prevId),
      ])
      if (get().activeTabId !== myTabId) return
      set(s => ({
        selectedClass: detail,
        graph,
        isLoadingDetail: false,
        isLoadingGraph: false,
        tabs: s.tabs.map(t =>
          t.id === myTabId ? { ...t, label: detail?.name ?? 'New Tab' } : t
        ),
      }))
      if (detail?.location) {
        if (get().activeTabId !== myTabId) return
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to go back:', err)
      if (get().activeTabId !== myTabId) return
      set({ isLoadingDetail: false, isLoadingGraph: false })
    }
  },

  goForward: async () => {
    const myTabId = get().activeTabId
    const { navForwardStack, selectedClass } = get()
    if (navForwardStack.length === 0) return
    const nextId = navForwardStack[navForwardStack.length - 1]
    const currentId = selectedClass?.id

    // Move current to back stack, pop from forward stack
    set(s => ({
      navForwardStack: s.navForwardStack.slice(0, -1),
      navBackStack: currentId ? [...s.navBackStack, currentId] : s.navBackStack,
    }))

    // Load the class (without pushing to history again)
    set({ isLoadingDetail: true, isLoadingGraph: true, selectedMember: null, selectedMembers: new Set() })
    try {
      const [detail, graph] = await Promise.all([
        api.getClassDetail(nextId),
        api.getClassHierarchy(nextId),
      ])
      if (get().activeTabId !== myTabId) return
      set(s => ({
        selectedClass: detail,
        graph,
        isLoadingDetail: false,
        isLoadingGraph: false,
        tabs: s.tabs.map(t =>
          t.id === myTabId ? { ...t, label: detail?.name ?? 'New Tab' } : t
        ),
      }))
      if (detail?.location) {
        if (get().activeTabId !== myTabId) return
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to go forward:', err)
      if (get().activeTabId !== myTabId) return
      set({ isLoadingDetail: false, isLoadingGraph: false })
    }
  },

  setLeftPanelOpen: (open: boolean) => {
    set({ leftPanelOpen: open })
  },
}))

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  ;(window as any).__telepathyStore = useAppStore
}
