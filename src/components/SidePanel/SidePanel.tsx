// ============================================================
// Side Panel — VS-style vertical tab strip (right side)
// Narrow strip with rotated text labels, click to open/close.
// ============================================================

import { SavedViews } from './SavedViews'
import { useAppStore } from '../../stores/appStore'
import './SidePanel.css'

interface PanelTab {
  id: string
  label: string
  render: () => React.ReactNode
}

const panelTabs: PanelTab[] = [
  { id: 'saved-views', label: 'Saved Views', render: () => <SavedViews /> },
]

export function SidePanel() {
  const activeSidePanel = useAppStore(s => s.activeSidePanel)
  const setActiveSidePanel = useAppStore(s => s.setActiveSidePanel)

  const activeTab = activeSidePanel
    ? panelTabs.find(t => t.id === activeSidePanel)
    : null

  const toggleTab = (id: string) => {
    setActiveSidePanel(activeSidePanel === id ? null : id)
  }

  return (
    <div className="side-panel-container">
      {/* Panel content (left of tab strip, shown when a tab is active) */}
      {activeTab && (
        <div className="side-panel-content">
          <div className="side-panel-content-header">
            <span className="side-panel-content-title">{activeTab.label}</span>
          </div>
          <div className="side-panel-content-body">
            {activeTab.render()}
          </div>
        </div>
      )}

      {/* Vertical tab strip (always visible) */}
      <div className="side-panel-tab-strip">
        {panelTabs.map(tab => (
          <button
            key={tab.id}
            className={`side-panel-tab ${activeSidePanel === tab.id ? 'active' : ''}`}
            onClick={() => toggleTab(tab.id)}
            title={tab.label}
          >
            <span className="side-panel-tab-text">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
