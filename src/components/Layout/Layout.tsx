// ============================================================
// Main Layout
// Left: Symbol Tree | Center: Graph View | Code Preview
// Right: VS-style Side Panel (outside Allotment, self-managed width)
// ============================================================

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { SymbolTree } from '../SymbolTree/SymbolTree'
import { GraphView } from '../GraphView/GraphView'
import { CodePreview } from '../CodePreview/CodePreview'
import { SidePanel } from '../SidePanel/SidePanel'
import { useAppStore } from '../../stores/appStore'
import './Layout.css'

export function MainLayout() {
  const leftPanelOpen = useAppStore(s => s.leftPanelOpen)
  const setLeftPanelOpen = useAppStore(s => s.setLeftPanelOpen)

  return (
    <div className="main-layout">
      {/* Expand strip shown when left panel is collapsed */}
      {!leftPanelOpen && (
        <button
          className="panel-expand-strip panel-expand-left"
          onClick={() => setLeftPanelOpen(true)}
          title="Show symbol tree"
        >
          <span className="expand-icon">&#x276F;</span>
        </button>
      )}

      {/* Main 3-pane area */}
      <Allotment
        defaultSizes={[250, 600, 350]}
        separator
      >
        {/* Left Panel - Symbol Tree */}
        <Allotment.Pane
          minSize={180}
          preferredSize={250}
          visible={leftPanelOpen}
        >
          <div className="panel">
            <SymbolTree onCollapse={() => setLeftPanelOpen(false)} />
          </div>
        </Allotment.Pane>

        {/* Center Panel - Graph View */}
        <Allotment.Pane minSize={300}>
          <div className="panel">
            <GraphView />
          </div>
        </Allotment.Pane>

        {/* Code Preview Panel */}
        <Allotment.Pane minSize={200} preferredSize={350}>
          <div className="panel">
            <CodePreview />
          </div>
        </Allotment.Pane>
      </Allotment>

      {/* VS-style Side Panel (always visible — tab strip + optional content) */}
      <SidePanel />
    </div>
  )
}
