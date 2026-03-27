// ============================================================
// Telepathy - Main UI Store (Zustand)
// Supports multiple class tabs with swap-in/swap-out pattern
// ============================================================

import { create } from 'zustand'
import type { CodeSymbol, CodeGraph, SymbolSummary, SymbolEdge, TabState, TabInfo, PinnedMember, SavedViewNode, SavedViewTree, SavedViewCategory } from '../types/model'
import { EdgeKind, SymbolKind } from '../types/model'
import * as api from '../api'
import { parseCallstack, resolveCallstack } from '../utils/callstackParser'
import { buildSessionKey, serializeSession, type PendingTabRestore } from './sessionSerializer'
import type { SessionData } from '../../electron/storage/types'

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
    pinnedClasses: new Map<string, CodeSymbol>(),
    pinnedMembers: new Map<string, PinnedMember>(),
    savedViewId: null,
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
    pinnedClasses: state.pinnedClasses,
    pinnedMembers: state.pinnedMembers,
    savedViewId: state.savedViewId,
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
  pinnedClasses: Map<string, CodeSymbol>
  pinnedMembers: Map<string, PinnedMember>
  savedViewId: string | null

  // --- Tab management ---
  tabs: TabInfo[]
  activeTabId: string | null

  // --- Session restore (transient) ---
  tabRestoreQueue: Map<string, PendingTabRestore>

  // Search
  searchQuery: string
  searchResults: SymbolSummary[]
  isSearching: boolean

  // --- Saved Views (right panel, global) ---
  savedViews: SavedViewTree
  activeSidePanel: string | null

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
  togglePinClass: (classId: string) => Promise<void>
  togglePinMember: (member: CodeSymbol, classId: string) => void
  unpinAll: () => void
  loadHierarchy: (classId: string) => Promise<void>
  loadSource: (file: string, line: number) => Promise<void>
  loadCallstack: (text: string) => void
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  setLeftPanelOpen: (open: boolean) => void

  // Actions - Saved views
  setActiveSidePanel: (panelId: string | null) => void
  saveCurrentView: (category: SavedViewCategory, name?: string) => void
  updateSavedView: (viewId: string) => void
  saveOrUpdateView: () => void
  openSavedView: (nodeId: string) => Promise<void>
  renameSavedView: (nodeId: string, newName: string) => void
  deleteSavedView: (nodeId: string) => void
  createSavedViewFolder: (category: SavedViewCategory, parentId?: string, name?: string) => void
  moveSavedView: (nodeId: string, targetParentId: string | null, category?: SavedViewCategory) => void
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
  pinnedClasses: new Map<string, CodeSymbol>(),
  pinnedMembers: new Map<string, PinnedMember>(),
  savedViewId: null,

  // Tabs
  tabs: [initialTab],
  activeTabId: initialTabId,

  // Session restore
  tabRestoreQueue: new Map<string, PendingTabRestore>(),

  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // Saved views
  savedViews: { classView: [], callstack: [] },
  activeSidePanel: null,

  // ---- Global actions ----

  openDatabase: async (dbPath: string) => {
    try {
      await api.initPlugin('vs-browse-db', dbPath)

      // Try to load saved session
      const sessionKey = buildSessionKey('vs-browse-db', dbPath)
      let session: SessionData | null = null
      try {
        session = await api.sessionLoad(sessionKey)
      } catch { /* ignore load failure */ }

      if (session && session.tabs.length > 0) {
        // ---- Restore from saved session ----
        const restoreQueue = new Map<string, PendingTabRestore>()
        const restoredTabs: TabInfo[] = session.tabs.map(st => {
          restoreQueue.set(st.id, { serialized: st })
          return { id: st.id, label: st.label, state: defaultTabState() }
        })

        // Advance nextTabId past any restored IDs to avoid collisions
        for (const st of session.tabs) {
          const match = st.id.match(/^tab-(\d+)$/)
          if (match) {
            const num = parseInt(match[1], 10) + 1
            if (num > nextTabId) nextTabId = num
          }
        }

        // Use saved activeTabId, fallback to first tab
        const activeId = session.tabs.find(t => t.id === session!.activeTabId)
          ? session.activeTabId
          : session.tabs[0].id

        set({
          isConnected: true,
          dbPath,
          tabs: restoredTabs,
          activeTabId: activeId,
          tabRestoreQueue: restoreQueue,
          savedViews: session.savedViews ?? { classView: [], callstack: [] },
          ...defaultTabState(),
        })

        await get().loadClasses()

        // Immediately rehydrate the active tab
        await rehydrateActiveTab(activeId)
      } else {
        // ---- No session — fresh start ----
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
          tabRestoreQueue: new Map(),
          savedViews: { classView: [], callstack: [] },
          ...defaultTabState(),
        })
        await get().loadClasses()
      }
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

    // Lazy rehydrate if this tab is pending restore
    if (state.tabRestoreQueue.has(tabId)) {
      rehydrateActiveTab(tabId)
    }
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

  togglePinClass: async (classId: string) => {
    const myTabId = get().activeTabId
    const pinned = get().pinnedClasses

    if (pinned.has(classId)) {
      // Unpin — remove class and any members belonging to it
      const nextClasses = new Map(pinned)
      nextClasses.delete(classId)
      const nextMembers = new Map(get().pinnedMembers)
      for (const [key, pm] of nextMembers) {
        if (pm.classId === classId) nextMembers.delete(key)
      }
      set({ pinnedClasses: nextClasses, pinnedMembers: nextMembers })
    } else {
      // Pin — fetch class detail then store
      try {
        const detail = await api.getClassDetail(classId)
        if (get().activeTabId !== myTabId) return
        if (!detail) return
        const nextClasses = new Map(get().pinnedClasses)
        nextClasses.set(classId, detail)
        set({ pinnedClasses: nextClasses })
      } catch (err) {
        console.error('Failed to pin class:', err)
      }
    }
  },

  togglePinMember: (member: CodeSymbol, classId: string) => {
    const pinned = get().pinnedMembers
    const key = member.id

    if (pinned.has(key)) {
      // Unpin member
      const next = new Map(pinned)
      next.delete(key)
      set({ pinnedMembers: next })
    } else {
      // Pin member — also ensure parent class is pinned
      const next = new Map(pinned)
      // Resolve parent class name from selectedClass or pinnedClasses
      const parentClass = get().selectedClass?.id === classId
        ? get().selectedClass
        : get().pinnedClasses.get(classId) ?? null
      const className = parentClass?.name ?? classId

      next.set(key, { member, classId, className })
      set({ pinnedMembers: next })

      // Auto-pin parent class if not already pinned
      if (!get().pinnedClasses.has(classId)) {
        get().togglePinClass(classId)
      }
    }
  },

  unpinAll: () => {
    set({
      pinnedClasses: new Map<string, CodeSymbol>(),
      pinnedMembers: new Map<string, PinnedMember>(),
    })
  },

  setLeftPanelOpen: (open: boolean) => {
    set({ leftPanelOpen: open })
  },

  // ---- Saved Views actions ----

  setActiveSidePanel: (panelId: string | null) => {
    set({ activeSidePanel: panelId })
  },

  saveCurrentView: (category: SavedViewCategory, name?: string) => {
    const state = get()
    const viewId = `sv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    // Capture current pin state (shared by both view types)
    const pinnedClassIds = [...state.pinnedClasses.keys()]
    const pinnedMemberEntries = [...state.pinnedMembers.entries()].map(([, pm]) => ({
      memberId: pm.member.id,
      classId: pm.classId,
    }))

    let node: SavedViewNode | null = null

    if (category === 'class-view') {
      const cls = state.selectedClass
      if (!cls) return // nothing to save
      node = {
        id: viewId,
        name: name ?? cls.name,
        type: 'view',
        viewType: 'class-view',
        classId: cls.id,
        pinnedClassIds,
        pinnedMemberEntries,
      }
    } else if (category === 'callstack') {
      const graph = state.graph
      if (!graph) return
      node = {
        id: viewId,
        name: name ?? state.tabs.find(t => t.id === state.activeTabId)?.label ?? 'Callstack',
        type: 'view',
        viewType: 'callstack',
        graph,
        pinnedClassIds,
        pinnedMemberEntries,
      }
    }

    if (!node) return

    const sv = get().savedViews
    if (category === 'class-view') {
      set({ savedViews: { ...sv, classView: [...sv.classView, node] } })
    } else {
      set({ savedViews: { ...sv, callstack: [...sv.callstack, node] } })
    }

    // Link the active tab to this saved view
    set({ savedViewId: viewId })
  },

  updateSavedView: (viewId: string) => {
    const state = get()
    const sv = state.savedViews
    const node = findNodeInTree(viewId, [...sv.classView, ...sv.callstack])
    if (!node || node.type !== 'view') return

    // Build updated pin state
    const pinnedClassIds = [...state.pinnedClasses.keys()]
    const pinnedMemberEntries = [...state.pinnedMembers.entries()].map(([, pm]) => ({
      memberId: pm.member.id,
      classId: pm.classId,
    }))

    const updater = (n: SavedViewNode): SavedViewNode => {
      if (n.viewType === 'class-view') {
        return {
          ...n,
          classId: state.selectedClass?.id ?? n.classId,
          pinnedClassIds,
          pinnedMemberEntries,
        }
      } else if (n.viewType === 'callstack') {
        return {
          ...n,
          graph: state.graph ?? n.graph,
          pinnedClassIds,
          pinnedMemberEntries,
        }
      }
      return n
    }

    set({
      savedViews: {
        classView: updateNodeInList(sv.classView, viewId, updater),
        callstack: updateNodeInList(sv.callstack, viewId, updater),
      },
    })
  },

  saveOrUpdateView: () => {
    const state = get()
    // If tab is linked to a saved view, update it
    if (state.savedViewId) {
      const sv = state.savedViews
      const node = findNodeInTree(state.savedViewId, [...sv.classView, ...sv.callstack])
      if (node) {
        get().updateSavedView(state.savedViewId)
        return
      }
    }
    // Otherwise create a new saved view
    const category: SavedViewCategory | null = state.selectedClass ? 'class-view' : state.graph ? 'callstack' : null
    if (category) {
      get().saveCurrentView(category)
    }
  },

  openSavedView: async (nodeId: string) => {
    const sv = get().savedViews
    const node = findNodeInTree(nodeId, [...sv.classView, ...sv.callstack])
    if (!node || node.type !== 'view') return

    // Check if any open tab is already linked to this saved view
    const existingTab = get().tabs.find(t => {
      if (t.id === get().activeTabId) {
        // Active tab: check flat store
        return get().savedViewId === nodeId
      }
      // Background tab: check stored snapshot
      return t.state.savedViewId === nodeId
    })

    if (existingTab) {
      // Jump to the existing linked tab
      get().switchTab(existingTab.id)
      return
    }

    if (node.viewType === 'class-view' && node.classId) {
      await get().createTab(node.classId)
    } else if (node.viewType === 'callstack' && node.graph) {
      // Create a callstack tab with stored graph
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
      const newTabId = generateTabId()
      const newTab: TabInfo = {
        id: newTabId,
        label: node.name,
        state: defaultTabState(),
      }
      set({
        ...defaultTabState(),
        graph: node.graph,
        tabs: [...get().tabs, newTab],
        activeTabId: newTabId,
      })
    }

    // Restore pinned classes and members if saved
    const hasPins = (node.pinnedClassIds?.length ?? 0) > 0
      || (node.pinnedMemberEntries?.length ?? 0) > 0

    if (!hasPins) {
      // No pins to restore, just set the linkage
      set({ savedViewId: nodeId })
      return
    }

    const tabId = get().activeTabId
    const pinnedClasses = new Map<string, CodeSymbol>()

    // Fetch pinned class details in parallel
    if (node.pinnedClassIds && node.pinnedClassIds.length > 0) {
      const details = await Promise.all(
        node.pinnedClassIds.map(id => api.getClassDetail(id))
      )
      if (get().activeTabId !== tabId) return // tab-switch guard
      for (const detail of details) {
        if (detail) pinnedClasses.set(detail.id, detail)
      }
    }

    // Restore pinned members from their parent class's members[]
    const pinnedMembers = new Map<string, PinnedMember>()
    if (node.pinnedMemberEntries) {
      const selectedClass = get().selectedClass
      for (const entry of node.pinnedMemberEntries) {
        const parentClass = pinnedClasses.get(entry.classId)
          ?? (selectedClass?.id === entry.classId ? selectedClass : null)
        if (!parentClass?.members) continue
        const member = parentClass.members.find(m => m.id === entry.memberId)
        if (member) {
          pinnedMembers.set(member.id, {
            member,
            classId: entry.classId,
            className: parentClass.name,
          })
        }
      }
    }

    // Guard: tab may have switched during async fetch
    if (get().activeTabId !== tabId) return

    set({ pinnedClasses, pinnedMembers, savedViewId: nodeId })
  },

  renameSavedView: (nodeId: string, newName: string) => {
    const state = get()
    const sv = state.savedViews

    // Sync linked tab label: active tab (flat store) or background tab (snapshot)
    const updates: Partial<AppState> = {
      savedViews: {
        classView: updateNodeInList(sv.classView, nodeId, n => ({ ...n, name: newName })),
        callstack: updateNodeInList(sv.callstack, nodeId, n => ({ ...n, name: newName })),
      },
    }
    if (state.savedViewId === nodeId) {
      updates.tabs = state.tabs.map(t =>
        t.id === state.activeTabId ? { ...t, label: newName } : t
      )
    } else {
      const linked = state.tabs.find(t => t.state.savedViewId === nodeId)
      if (linked) {
        updates.tabs = state.tabs.map(t =>
          t.id === linked.id ? { ...t, label: newName } : t
        )
      }
    }
    set(updates)
  },

  deleteSavedView: (nodeId: string) => {
    const sv = get().savedViews
    set({
      savedViews: {
        classView: removeNodeFromList(sv.classView, nodeId),
        callstack: removeNodeFromList(sv.callstack, nodeId),
      },
    })
  },

  createSavedViewFolder: (category: SavedViewCategory, parentId?: string, name?: string) => {
    const folderId = `svf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const folder: SavedViewNode = {
      id: folderId,
      name: name ?? 'New Folder',
      type: 'folder',
      children: [],
    }

    const sv = get().savedViews
    if (parentId) {
      // Insert as child of target folder
      set({
        savedViews: {
          classView: insertIntoFolder(sv.classView, parentId, folder),
          callstack: insertIntoFolder(sv.callstack, parentId, folder),
        },
      })
    } else {
      // Insert at root level
      if (category === 'class-view') {
        set({ savedViews: { ...sv, classView: [...sv.classView, folder] } })
      } else {
        set({ savedViews: { ...sv, callstack: [...sv.callstack, folder] } })
      }
    }
  },

  moveSavedView: (nodeId: string, targetParentId: string | null, category?: SavedViewCategory) => {
    const sv = get().savedViews
    // Find and remove the node from its current position
    let moved: SavedViewNode | null = null
    const withoutClassView = removeNodeFromList(sv.classView, nodeId, n => { moved = n })
    if (!moved) {
      const withoutCallstack = removeNodeFromList(sv.callstack, nodeId, n => { moved = n })
      if (!moved) return
      // Node was in callstack tree
      if (targetParentId) {
        set({
          savedViews: {
            classView: insertIntoFolder(withoutClassView, targetParentId, moved),
            callstack: insertIntoFolder(withoutCallstack, targetParentId, moved),
          },
        })
      } else {
        const target = category ?? 'callstack'
        set({
          savedViews: {
            classView: target === 'class-view' ? [...withoutClassView, moved] : withoutClassView,
            callstack: target === 'callstack' ? [...withoutCallstack, moved] : withoutCallstack,
          },
        })
      }
    } else {
      // Node was in classView tree
      if (targetParentId) {
        set({
          savedViews: {
            classView: insertIntoFolder(withoutClassView, targetParentId, moved),
            callstack: insertIntoFolder(sv.callstack, targetParentId, moved),
          },
        })
      } else {
        const target = category ?? 'class-view'
        set({
          savedViews: {
            classView: target === 'class-view' ? [...withoutClassView, moved] : withoutClassView,
            callstack: target === 'callstack' ? [...sv.callstack, moved] : sv.callstack,
          },
        })
      }
    }
  },
}))

// ============================================================
// Saved Views — tree manipulation helpers
// ============================================================

function findNodeInTree(id: string, nodes: SavedViewNode[]): SavedViewNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeInTree(id, n.children)
      if (found) return found
    }
  }
  return null
}

function updateNodeInList(
  nodes: SavedViewNode[],
  id: string,
  updater: (n: SavedViewNode) => SavedViewNode,
): SavedViewNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n)
    if (n.children) {
      return { ...n, children: updateNodeInList(n.children, id, updater) }
    }
    return n
  })
}

function removeNodeFromList(
  nodes: SavedViewNode[],
  id: string,
  onRemove?: (n: SavedViewNode) => void,
): SavedViewNode[] {
  const result: SavedViewNode[] = []
  for (const n of nodes) {
    if (n.id === id) {
      onRemove?.(n)
      continue
    }
    if (n.children) {
      result.push({ ...n, children: removeNodeFromList(n.children, id, onRemove) })
    } else {
      result.push(n)
    }
  }
  return result
}

function insertIntoFolder(
  nodes: SavedViewNode[],
  folderId: string,
  child: SavedViewNode,
): SavedViewNode[] {
  return nodes.map(n => {
    if (n.id === folderId && n.type === 'folder') {
      return { ...n, children: [...(n.children ?? []), child] }
    }
    if (n.children) {
      return { ...n, children: insertIntoFolder(n.children, folderId, child) }
    }
    return n
  })
}

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  ;(window as any).__telepathyStore = useAppStore
}

// ============================================================
// Dirty detection — is the tab state different from linked saved view?
// ============================================================

export function isTabDirty(state: AppState): boolean {
  if (!state.savedViewId) return false
  const sv = state.savedViews
  const node = findNodeInTree(state.savedViewId, [...sv.classView, ...sv.callstack])
  if (!node || node.type !== 'view') return false

  // Compare class ID for class-view
  if (node.viewType === 'class-view') {
    if (state.selectedClass?.id !== node.classId) return true
  }
  // Compare graph reference for callstack
  if (node.viewType === 'callstack') {
    if (state.graph !== node.graph) return true
  }
  // Compare pinned classes
  const savedPinIds = node.pinnedClassIds ?? []
  const currentPinIds = [...state.pinnedClasses.keys()]
  if (savedPinIds.length !== currentPinIds.length
    || !savedPinIds.every(id => state.pinnedClasses.has(id))) return true
  // Compare pinned members
  const savedMembers = node.pinnedMemberEntries ?? []
  const currentMembers = [...state.pinnedMembers.values()].map(pm => ({
    memberId: pm.member.id,
    classId: pm.classId,
  }))
  if (savedMembers.length !== currentMembers.length) return true
  const savedSet = new Set(savedMembers.map(e => `${e.memberId}:${e.classId}`))
  if (!currentMembers.every(e => savedSet.has(`${e.memberId}:${e.classId}`))) return true

  return false
}

// ============================================================
// Session restore — rehydrate a tab from saved IDs
// ============================================================

async function rehydrateActiveTab(tabId: string): Promise<void> {
  const get = () => useAppStore.getState()
  const set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
    useAppStore.setState(partial)

  const queue = get().tabRestoreQueue
  const pending = queue.get(tabId)
  if (!pending) return

  const { serialized } = pending

  // Show loading state
  set({ isLoadingDetail: true, isLoadingGraph: true })

  try {
    // 1. Fetch selected class + graph
    let selectedClass: CodeSymbol | null = null
    let graph: CodeGraph | null = null

    if (serialized.selectedClassId) {
      const [detail, hierarchy] = await Promise.all([
        api.getClassDetail(serialized.selectedClassId),
        api.getClassHierarchy(serialized.selectedClassId),
      ])
      if (get().activeTabId !== tabId) return
      selectedClass = detail
      graph = hierarchy
    }

    // 2. Fetch pinned class details
    const pinnedClasses = new Map<string, CodeSymbol>()
    if (serialized.pinnedClassIds.length > 0) {
      const details = await Promise.all(
        serialized.pinnedClassIds.map(id => api.getClassDetail(id))
      )
      if (get().activeTabId !== tabId) return
      for (const detail of details) {
        if (detail) pinnedClasses.set(detail.id, detail)
      }
    }

    // 3. Restore pinned members from their parent class's members[]
    const pinnedMembers = new Map<string, PinnedMember>()
    for (const entry of serialized.pinnedMemberEntries) {
      const parentClass = pinnedClasses.get(entry.classId)
        ?? (selectedClass?.id === entry.classId ? selectedClass : null)
      if (!parentClass?.members) continue
      const member = parentClass.members.find(m => m.id === entry.memberId)
      if (member) {
        pinnedMembers.set(member.id, {
          member,
          classId: entry.classId,
          className: parentClass.name,
        })
      }
    }

    // 4. Restore selected member
    let selectedMember: CodeSymbol | null = null
    if (serialized.selectedMemberId && selectedClass?.members) {
      selectedMember = selectedClass.members.find(
        m => m.id === serialized.selectedMemberId
      ) ?? null
    }

    // 5. Guard: tab may have changed
    if (get().activeTabId !== tabId) return

    // 6. Remove from queue + apply state
    const nextQueue = new Map(get().tabRestoreQueue)
    nextQueue.delete(tabId)

    set(s => ({
      selectedClass,
      graph,
      selectedMember,
      selectedMembers: new Set(serialized.selectedMemberIds),
      pinnedClasses,
      pinnedMembers,
      navBackStack: [...serialized.navBackStack],
      navForwardStack: [...serialized.navForwardStack],
      leftPanelOpen: serialized.leftPanelOpen,
      savedViewId: serialized.savedViewId ?? null,
      isLoadingDetail: false,
      isLoadingGraph: false,
      tabRestoreQueue: nextQueue,
      tabs: s.tabs.map(t =>
        t.id === tabId ? { ...t, label: selectedClass?.name ?? serialized.label } : t
      ),
    }))

    // 7. Load source code
    if (selectedMember?.location) {
      if (get().activeTabId !== tabId) return
      await useAppStore.getState().loadSource(selectedMember.location.file, selectedMember.location.line)
    } else if (selectedClass?.location) {
      if (get().activeTabId !== tabId) return
      await useAppStore.getState().loadSource(selectedClass.location.file, selectedClass.location.line)
    }
  } catch (err) {
    console.error(`Failed to rehydrate tab ${tabId}:`, err)
    if (get().activeTabId !== tabId) return
    const nextQueue = new Map(get().tabRestoreQueue)
    nextQueue.delete(tabId)
    set({
      tabRestoreQueue: nextQueue,
      isLoadingDetail: false,
      isLoadingGraph: false,
    })
  }
}

// ============================================================
// Auto-save — debounced session persistence on state changes
// ============================================================

const SAVE_DEBOUNCE_MS = 2000
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const state = useAppStore.getState()
    if (!state.isConnected || !state.dbPath) return

    const sessionData = serializeSession(
      'vs-browse-db',
      state.dbPath,
      state.activeTabId!,
      captureTabState(state),
      state.tabs,
      state.tabRestoreQueue,
      state.savedViews,
    )

    const key = buildSessionKey('vs-browse-db', state.dbPath)
    try {
      await api.sessionSave(key, sessionData)
    } catch (err) {
      console.error('Failed to auto-save session:', err)
    }
  }, SAVE_DEBOUNCE_MS)
}

// Subscribe to all state changes
useAppStore.subscribe(scheduleSave)
