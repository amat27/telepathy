// ============================================================
// PartDockview — single dockview instance scoped to one Part.
// Renders the views currently located in this Part.
// On view set change (location/hidden), reconciles dockview panels.
// ============================================================

import { useCallback, useEffect, useRef } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
} from 'dockview-react'

import { VIEWS, type ViewId, type PartId } from '../../views/registry'
import { useShellStore } from '../../stores/shellStore'
import { MoveMenu } from './MoveMenu'

interface PartDockviewProps {
  part: PartId
}

// Generic panel body that delegates to registry render
function ViewPanelBody(props: IDockviewPanelProps<{ viewId: ViewId }>) {
  const viewId = props.params.viewId
  const def = VIEWS[viewId]
  if (!def) return <div>Unknown view: {viewId}</div>
  return <div className="part-panel-body">{def.render()}</div>
}

// Custom tab header — title + MoveMenu trigger
function ViewTabHeader(props: IDockviewPanelHeaderProps<{ viewId: ViewId; part: PartId }>) {
  const viewId = props.params.viewId
  const part = props.params.part
  const def = VIEWS[viewId]
  return (
    <div className="dv-default-tab" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: '100%' }}>
      <span className="dv-default-tab-content" style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>
        {def?.title ?? viewId}
      </span>
      <MoveMenu viewId={viewId} currentPart={part} />
    </div>
  )
}

const components = {
  view: ViewPanelBody,
}
const tabComponents = {
  viewTab: ViewTabHeader,
}

export function PartDockview({ part }: PartDockviewProps) {
  const apiRef = useRef<DockviewApi | null>(null)
  const viewLocations = useShellStore(s => s.viewLocations)
  const hiddenViews = useShellStore(s => s.hiddenViews)
  const activeView = useShellStore(s => s.activeView[part])
  const setActiveView = useShellStore(s => s.setActiveView)

  // Compute which view IDs belong in this Part
  const viewsInPart = (Object.keys(viewLocations) as ViewId[]).filter(
    vid => viewLocations[vid] === part && !hiddenViews.includes(vid),
  )

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api
    // Initial render — add panels for views currently in this Part
    const initial = (Object.keys(viewLocations) as ViewId[]).filter(
      vid => viewLocations[vid] === part && !hiddenViews.includes(vid),
    )
    for (const vid of initial) {
      event.api.addPanel({
        id: vid,
        component: 'view',
        tabComponent: 'viewTab',
        title: VIEWS[vid].title,
        params: { viewId: vid, part },
      })
    }
    // Active view selection
    const initialActive = useShellStore.getState().activeView[part]
    if (initialActive && initial.includes(initialActive)) {
      event.api.getPanel(initialActive)?.api.setActive()
    }
    // Track active panel changes back to store
    event.api.onDidActivePanelChange(panel => {
      if (panel) setActiveView(part, panel.id as ViewId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part])

  // Reconcile when viewsInPart changes (add new, remove gone)
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const existingIds = new Set(api.panels.map(p => p.id))
    const targetIds = new Set(viewsInPart)
    // Remove panels not in target
    for (const p of api.panels) {
      if (!targetIds.has(p.id as ViewId)) {
        api.removePanel(p)
      }
    }
    // Add panels not yet present
    for (const vid of viewsInPart) {
      if (!existingIds.has(vid)) {
        api.addPanel({
          id: vid,
          component: 'view',
          tabComponent: 'viewTab',
          title: VIEWS[vid].title,
          params: { viewId: vid, part },
        })
      }
    }
    // Update active view
    if (activeView && targetIds.has(activeView)) {
      api.getPanel(activeView)?.api.setActive()
    }
  }, [viewsInPart.join(','), activeView, part])

  if (viewsInPart.length === 0) {
    return (
      <div className="shell-empty-part">
        Drop views here<br />
        <span style={{ fontSize: 'var(--fs-xs)' }}>or use the ⋯ menu on a tab</span>
      </div>
    )
  }

  return (
    <div className="part-dockview-host">
      <DockviewReact
        className="dockview-theme-telepathy"
        components={components}
        tabComponents={tabComponents}
        onReady={onReady}
      />
    </div>
  )
}
