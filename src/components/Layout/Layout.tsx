// ============================================================
// Main 3-Panel Layout (Sourcetrail-style)
// Left: Symbol Tree | Center: Graph View | Right: Code Preview
// ============================================================

import { useState } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { SymbolTree } from '../SymbolTree/SymbolTree'
import { GraphView } from '../GraphView/GraphView'
import { CodePreview } from '../CodePreview/CodePreview'
import './Layout.css'

export function MainLayout() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)

  return (
    <div className="main-layout">
      {/* Expand strip shown when left panel is collapsed */}
      {!leftPanelOpen && (
        <button
          className="panel-expand-strip"
          onClick={() => setLeftPanelOpen(true)}
          title="Show symbol tree"
        >
          <span className="expand-icon">&#x276F;</span>
        </button>
      )}

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

        {/* Right Panel - Code Preview */}
        <Allotment.Pane minSize={200} preferredSize={350}>
          <div className="panel">
            <CodePreview />
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
