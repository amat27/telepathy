// ============================================================
// Tab Bar - Horizontal class tabs
// ============================================================

import { useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import './TabBar.css'

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, createTab } = useAppStore()

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
