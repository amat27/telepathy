// ============================================================
// Tab Bar - Horizontal class tabs with save button
// ============================================================

import { useCallback } from 'react'
import { useAppStore, isTabDirty } from '../../stores/appStore'
import type { SavedViewCategory } from '../../types/model'
import './TabBar.css'

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, createTab, saveOrUpdateView, saveCurrentView } = useAppStore()
  const selectedClass = useAppStore(s => s.selectedClass)
  const graph = useAppStore(s => s.graph)
  const savedViewId = useAppStore(s => s.savedViewId)
  const dirty = useAppStore(s => isTabDirty(s))

  const handleTabClick = useCallback((tabId: string) => {
    switchTab(tabId)
  }, [switchTab])

  const handleTabClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    closeTab(tabId)
  }, [closeTab])

  const handleMouseDown = useCallback((e: React.MouseEvent, tabId: string) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault()
      closeTab(tabId)
    }
  }, [closeTab])

  const handleNewTab = useCallback(() => {
    createTab()
  }, [createTab])

  // Determine save category for the active tab
  const getSaveCategory = (): SavedViewCategory | null => {
    if (selectedClass) return 'class-view'
    if (graph) return 'callstack'
    return null
  }

  const handleSave = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    if (tabId !== activeTabId) return
    // If linked, update; otherwise create new
    saveOrUpdateView()
  }, [activeTabId, saveOrUpdateView])

  const canSave = getSaveCategory() !== null
  const isLinked = !!savedViewId

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          const showDirty = isActive && dirty
          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              title={tab.label}
            >
              <span className="tab-label">
                {tab.label}{showDirty ? ' *' : ''}
              </span>
              {isActive && canSave && (
                <button
                  className={`tab-save ${isLinked ? 'tab-save-linked' : ''}`}
                  onClick={(e) => handleSave(e, tab.id)}
                  title={isLinked ? (dirty ? 'Save changes (Ctrl+S)' : 'Saved') : 'Save to views (Ctrl+S)'}
                >
                  {/* Floppy disk SVG icon */}
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 1H3.5L1 3.5V13.5C1 14.33 1.67 15 2.5 15H13.5C14.33 15 15 14.33 15 13.5V2.5C15 1.67 14.33 1 13.5 1ZM8 13C6.62 13 5.5 11.88 5.5 10.5S6.62 8 8 8S10.5 9.12 10.5 10.5S9.38 13 8 13ZM11 5H3V2H11V5Z"/>
                  </svg>
                </button>
              )}
              <button
                className="tab-close"
                onClick={(e) => handleTabClose(e, tab.id)}
                title="Close tab"
              >
                &times;
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="tab-new"
        onClick={handleNewTab}
        title="New tab (Ctrl+T)"
      >
        +
      </button>
    </div>
  )
}
