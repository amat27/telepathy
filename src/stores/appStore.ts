// ============================================================
// Telepathy - Main UI Store (Zustand)
// ============================================================

import { create } from 'zustand'
import type { CodeSymbol, CodeGraph, SymbolSummary } from '../types/model'
import * as api from '../api'

interface AppState {
  // Connection state
  isConnected: boolean
  dbPath: string | null

  // Class list (left panel)
  classes: SymbolSummary[]
  classFilter: string
  isLoadingClasses: boolean

  // Selected class detail
  selectedClass: CodeSymbol | null
  isLoadingDetail: boolean

  // Selected member (for highlighting / source jump)
  selectedMember: CodeSymbol | null
  // Pinned members (for graph display via Ctrl+Click)
  selectedMembers: Set<string>

  // Graph (center panel)
  graph: CodeGraph | null
  isLoadingGraph: boolean

  // Code preview (right panel)
  sourceCode: string
  sourceFile: string | null
  sourceLine: number

  // Navigation history
  navBackStack: string[]     // class IDs
  navForwardStack: string[]  // class IDs

  // Search
  searchQuery: string
  searchResults: SymbolSummary[]
  isSearching: boolean

  // Actions
  openDatabase: (dbPath: string) => Promise<void>
  loadClasses: (filter?: string) => Promise<void>
  selectClass: (classId: string) => Promise<void>
  selectMember: (member: CodeSymbol) => Promise<void>
  toggleMember: (member: CodeSymbol) => void
  loadHierarchy: (classId: string) => Promise<void>
  loadSource: (file: string, line: number) => Promise<void>
  search: (query: string) => Promise<void>
  setClassFilter: (filter: string) => void
  goBack: () => Promise<void>
  goForward: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  isConnected: false,
  dbPath: null,

  classes: [],
  classFilter: '',
  isLoadingClasses: false,

  selectedClass: null,
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

  searchQuery: '',
  searchResults: [],
  isSearching: false,

  openDatabase: async (dbPath: string) => {
    try {
      await api.initPlugin('vs-browse-db', dbPath)
      set({ isConnected: true, dbPath })
      // Auto-load classes
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

  selectClass: async (classId: string) => {
    // Push current class to back stack (for navigation)
    const currentId = get().selectedClass?.id
    if (currentId && currentId !== classId) {
      set(s => ({
        navBackStack: [...s.navBackStack, currentId],
        navForwardStack: [],   // clear forward on new navigation
      }))
    }

    set({ isLoadingDetail: true, isLoadingGraph: true, selectedMember: null, selectedMembers: new Set() })
    try {
      const [detail, graph] = await Promise.all([
        api.getClassDetail(classId),
        api.getClassHierarchy(classId),
      ])
      set({
        selectedClass: detail,
        graph,
        isLoadingDetail: false,
        isLoadingGraph: false,
      })

      // Auto-load source code
      if (detail?.location) {
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to load class detail:', err)
      set({ isLoadingDetail: false, isLoadingGraph: false })
    }
  },

  selectMember: async (member: CodeSymbol) => {
    set({ selectedMember: member })
    if (member.location) {
      await get().loadSource(member.location.file, member.location.line)
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
    set({ isLoadingGraph: true })
    try {
      const graph = await api.getClassHierarchy(classId)
      set({ graph, isLoadingGraph: false })
    } catch (err) {
      console.error('Failed to load hierarchy:', err)
      set({ isLoadingGraph: false })
    }
  },

  loadSource: async (file: string, line: number) => {
    try {
      const sourceCode = await api.getSourceSnippet(file, line, 30)
      set({ sourceCode, sourceFile: file, sourceLine: line })
    } catch (err) {
      console.error('Failed to load source:', err)
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

  goBack: async () => {
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
      set({ selectedClass: detail, graph, isLoadingDetail: false, isLoadingGraph: false })
      if (detail?.location) {
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to go back:', err)
      set({ isLoadingDetail: false, isLoadingGraph: false })
    }
  },

  goForward: async () => {
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
      set({ selectedClass: detail, graph, isLoadingDetail: false, isLoadingGraph: false })
      if (detail?.location) {
        await get().loadSource(detail.location.file, detail.location.line)
      }
    } catch (err) {
      console.error('Failed to go forward:', err)
      set({ isLoadingDetail: false, isLoadingGraph: false })
    }
  },
}))

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  ;(window as any).__telepathyStore = useAppStore
}
