import type { SavedViewTree } from '../../src/types/model'

// ============================================================
// Telepathy - Session Storage Abstraction
// Backend-swappable interface (JSON files now, SQLite later)
// ============================================================

/** Serialized per-tab data (IDs only, re-fetched on restore) */
export interface SerializedTab {
  id: string
  label: string
  selectedClassId: string | null
  selectedMemberId: string | null
  selectedMemberIds: string[]
  pinnedClassIds: string[]
  pinnedMemberEntries: Array<{ memberId: string; classId: string }>
  navBackStack: string[]
  navForwardStack: string[]
  leftPanelOpen: boolean
  savedViewId: string | null           // linked saved view id
}

/** Full session snapshot for a data source */
export interface SessionData {
  version: number
  pluginName: string
  dataPath: string
  savedAt: string // ISO 8601
  activeTabId: string
  tabs: SerializedTab[]
  savedViews?: SavedViewTree  // persisted bookmarks
}

/** Abstract storage backend */
export interface SessionStorage {
  save(key: string, data: SessionData): Promise<void>
  load(key: string): Promise<SessionData | null>
  delete(key: string): Promise<void>
  list(): Promise<string[]>
}
