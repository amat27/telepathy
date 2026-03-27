// ============================================================
// Tab Bar - Horizontal class tabs with save button
// ============================================================

import { useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import type { SavedViewCategory } from '../../types/model'
import './TabBar.css'

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, createTab, saveCurrentView } = useAppStore()
  const selectedClass = useAppStore(s => s.selectedClass)
  const graph = useAppStore(s => s.graph)

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
    const cat = getSaveCategory()
    if (cat) saveCurrentView(cat)
  }, [activeTabId, saveCurrentView, selectedClass, graph])

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            title={tab.label}
          >
            <span className="tab-label">{tab.label}</span>
            {tab.id === activeTabId && getSaveCategory() && (
              <button
                className="tab-save"
                onClick={(e) => handleSave(e, tab.id)}
                title="Save to views"
              >
                &#x2661;
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
        ))}
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
