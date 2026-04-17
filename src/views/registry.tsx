// ============================================================
// View Registry
// Central manifest of all dockable views in the 3-Part Shell.
// Each view has an id, title, icon, and component renderer.
// ============================================================

import type { ComponentType, ReactElement } from 'react'
import { Folder, Network, Code2, Bookmark } from '../components/icons'
import { SymbolTree } from '../components/SymbolTree/SymbolTree'
import { GraphView } from '../components/GraphView/GraphView'
import { CodePreview } from '../components/CodePreview/CodePreview'
import { SavedViews } from '../components/SidePanel/SavedViews'
import { useAppStore } from '../stores/appStore'

export type ViewId = 'symbols' | 'graph' | 'code' | 'savedViews'
export type PartId = 'left' | 'center' | 'right'

export interface ViewDefinition {
  id: ViewId
  title: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  /** Default Part where this view lives on first launch */
  defaultPart: PartId
  /** Render the view body (no chrome — Part provides chrome) */
  render: () => ReactElement
}

// ----------------------------------------------------------
// View body wrappers — keep registry pure, push side effects
// (like store hooks) into wrappers.
// ----------------------------------------------------------

function SymbolsBody() {
  // Disable the legacy collapse button — Part chrome handles folding now.
  const setLeftPanelOpen = useAppStore(s => s.setLeftPanelOpen)
  return <SymbolTree onCollapse={() => setLeftPanelOpen(false)} />
}

function GraphBody() {
  return <GraphView />
}

function CodeBody() {
  return <CodePreview />
}

function SavedViewsBody() {
  return <SavedViews />
}

// ----------------------------------------------------------
// Registry
// ----------------------------------------------------------

export const VIEWS: Record<ViewId, ViewDefinition> = {
  symbols: {
    id: 'symbols',
    title: 'Symbols',
    icon: Folder,
    defaultPart: 'left',
    render: () => <SymbolsBody />,
  },
  graph: {
    id: 'graph',
    title: 'Graph',
    icon: Network,
    defaultPart: 'center',
    render: () => <GraphBody />,
  },
  code: {
    id: 'code',
    title: 'Code',
    icon: Code2,
    defaultPart: 'center',
    render: () => <CodeBody />,
  },
  savedViews: {
    id: 'savedViews',
    title: 'Saved Views',
    icon: Bookmark,
    defaultPart: 'right',
    render: () => <SavedViewsBody />,
  },
}

export const ALL_VIEW_IDS: ViewId[] = ['symbols', 'graph', 'code', 'savedViews']

export function getDefaultLocations(): Record<ViewId, PartId> {
  return {
    symbols: 'left',
    graph: 'center',
    code: 'center',
    savedViews: 'right',
  }
}
