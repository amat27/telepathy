// ============================================================
// Main Layout
// 3-Part Shell with collapsible left/right rails and a central
// dockview region. Each Part hosts its own dockview instance,
// allowing tab/split inside a Part. Cross-Part movement uses
// the per-tab MoveMenu (Move to Left/Center/Right/Hide).
// ============================================================

import { ThreePartShell } from '../Shell/ThreePartShell'
import './Layout.css'

export function MainLayout() {
  return (
    <div className="main-layout">
      <ThreePartShell />
    </div>
  )
}
