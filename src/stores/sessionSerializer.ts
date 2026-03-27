// ============================================================
// Session Serializer — converts live store state ↔ serializable data
// Only saves IDs; full objects re-fetched on restore
// ============================================================

import type { TabState, TabInfo, PinnedMember, SavedViewTree } from '../types/model'
import type { SerializedTab, SessionData } from '../../electron/storage/types'

/** Build a session key from plugin + data path */
export function buildSessionKey(pluginName: string, dataPath: string): string {
  return `${pluginName}:${dataPath}`
}

/** Serialize a single tab's state to lightweight IDs */
export function serializeTab(tabId: string, label: string, state: TabState): SerializedTab {
  return {
    id: tabId,
    label,
    selectedClassId: state.selectedClass?.id ?? null,
    selectedMemberId: state.selectedMember?.id ?? null,
    selectedMemberIds: [...state.selectedMembers],
    pinnedClassIds: [...state.pinnedClasses.keys()],
    pinnedMemberEntries: [...state.pinnedMembers.entries()].map(([, pm]) => ({
      memberId: pm.member.id,
      classId: pm.classId,
    })),
    navBackStack: [...state.navBackStack],
    navForwardStack: [...state.navForwardStack],
    leftPanelOpen: state.leftPanelOpen,
  }
}

/** Serialize the full app state into a SessionData object */
export function serializeSession(
  pluginName: string,
  dataPath: string,
  activeTabId: string,
  activeTabState: TabState,
  tabs: TabInfo[],
  pendingRestoreQueue?: Map<string, PendingTabRestore>,
  savedViews?: SavedViewTree,
): SessionData {
  const serializedTabs: SerializedTab[] = tabs.map(tab => {
    if (tab.id === activeTabId) {
      // Active tab: serialize from live flat state
      return serializeTab(tab.id, tab.label, activeTabState)
    }
    // Background tab: check if it's still pending restore
    if (pendingRestoreQueue?.has(tab.id)) {
      // Not yet rehydrated — preserve original serialized data
      return pendingRestoreQueue.get(tab.id)!.serialized
    }
    // Background tab: serialize from stored snapshot
    return serializeTab(tab.id, tab.label, tab.state)
  })

  return {
    version: 1,
    pluginName,
    dataPath,
    savedAt: new Date().toISOString(),
    activeTabId,
    tabs: serializedTabs,
    savedViews,
  }
}

/** Pending tab restore data (for lazy rehydration) */
export interface PendingTabRestore {
  serialized: SerializedTab
}
