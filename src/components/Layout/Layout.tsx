// ============================================================
// Main 3-Panel Layout (Sourcetrail-style)
// Left: Symbol Tree | Center: Graph View | Right: Code Preview
// ============================================================

import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { SymbolTree } from '../SymbolTree/SymbolTree'
import { GraphView } from '../GraphView/GraphView'
import { CodePreview } from '../CodePreview/CodePreview'
import './Layout.css'

export function MainLayout() {
  return (
    <div className="main-layout">
      <Allotment
        defaultSizes={[250, 600, 350]}
        separator
      >
        {/* Left Panel - Symbol Tree */}
        <Allotment.Pane minSize={180} preferredSize={250}>
          <div className="panel">
            <SymbolTree />
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
