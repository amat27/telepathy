// ============================================================
// Tab Bar - Horizontal class tabs with save button
// ============================================================

import { useCallback } from 'react'
import { useAppStore, isTabDirty } from '../../stores/appStore'
import type { SavedViewCategory } from '../../types/model'
import { Save, Plus, X } from '../icons'
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
                  aria-label="Save view"
                >
                  <Save size={12} strokeWidth={2} />
                </button>
              )}
              <button
                className="tab-close"
                onClick={(e) => handleTabClose(e, tab.id)}
                title="Close tab"
                aria-label="Close tab"
              >
                <X size={12} strokeWidth={2.25} />
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="tab-new"
        onClick={handleNewTab}
        title="New tab (Ctrl+T)"
        aria-label="New tab"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
