// ============================================================
// ThreePartShell — left rail/part | center part | right rail/part
// Side parts can collapse to 28px Rails. Drag handles on inner edges.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose } from '../icons'
import { PartDockview } from './PartDockview'
import { useShellStore } from '../../stores/shellStore'
import { VIEWS, type PartId, type ViewId } from '../../views/registry'
import './Shell.css'

// ----------------------------------------------------------
// Rail (collapsed Part)
// ----------------------------------------------------------

interface RailProps {
  side: 'left' | 'right'
  views: ViewId[]
  onExpand: () => void
  onActivateView: (viewId: ViewId) => void
}

function Rail({ side, views, onExpand }: RailProps) {
  const moveView = useShellStore(s => s.moveView)
  const setActiveView = useShellStore(s => s.setActiveView)
  const setPartOpen = useShellStore(s => s.setPartOpen)

  const ChevExpand = side === 'left' ? PanelRightOpen : PanelRightClose
  return (
    <div className={`shell-rail shell-rail--${side}`}>
      <button
        className="shell-rail-toggle"
        onClick={onExpand}
        title={`Expand ${side} panel`}
        aria-label={`Expand ${side} panel`}
      >
        <ChevExpand size={14} strokeWidth={1.75} />
      </button>
      <div className="shell-rail-views">
        {views.map(vid => {
          const def = VIEWS[vid]
          const Icon = def.icon
          return (
            <button
              key={vid}
              className="shell-rail-view"
              title={def.title}
              aria-label={def.title}
              onClick={() => {
                // Ensure view lives in this side's Part, then open + activate
                moveView(vid, side)
                setPartOpen(side, true)
                setActiveView(side, vid)
              }}
            >
              <Icon size={16} strokeWidth={1.75} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ----------------------------------------------------------
// CollapsiblePart wraps PartDockview + collapse button + resize
// ----------------------------------------------------------

interface CollapsiblePartProps {
  side: 'left' | 'right'
  open: boolean
  width: number
  onToggle: () => void
  onResize: (w: number) => void
}

function CollapsiblePart({ side, open, width, onToggle, onResize }: CollapsiblePartProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const [active, setActive] = useState(false)

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    setActive(true)
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = side === 'left'
        ? e.clientX - startX.current
        : startX.current - e.clientX
      onResize(startW.current + delta)
    }
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false
        setActive(false)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [side, onResize])

  if (!open) return null

  const ChevFold = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <div
      className={`shell-part shell-part--${side}`}
      style={{ width: `${width}px` }}
    >
      {/* Optional collapse strip on top of dockview */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
        padding: '0 4px',
        height: '24px',
        flexShrink: 0,
        borderBottom: 'var(--border-width) solid var(--border-color)',
        background: 'var(--bg-surface)',
      }}>
        <button
          onClick={onToggle}
          title={`Collapse ${side} panel`}
          aria-label={`Collapse ${side} panel`}
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <ChevFold size={14} strokeWidth={1.75} />
        </button>
      </div>
      <PartDockview part={side} />
      <div
        className={`shell-resize-handle ${active ? 'shell-resize-handle--active' : ''}`}
        onMouseDown={onMouseDown}
      />
    </div>
  )
}

// ----------------------------------------------------------
// ThreePartShell
// ----------------------------------------------------------

export function ThreePartShell() {
  const leftOpen = useShellStore(s => s.leftOpen)
  const rightOpen = useShellStore(s => s.rightOpen)
  const leftWidth = useShellStore(s => s.leftWidth)
  const rightWidth = useShellStore(s => s.rightWidth)
  const togglePart = useShellStore(s => s.togglePart)
  const setPartWidth = useShellStore(s => s.setPartWidth)
  const setActiveView = useShellStore(s => s.setActiveView)
  const viewLocations = useShellStore(s => s.viewLocations)
  const hiddenViews = useShellStore(s => s.hiddenViews)

  const viewsIn = useCallback((part: PartId): ViewId[] => {
    return (Object.keys(viewLocations) as ViewId[]).filter(
      v => viewLocations[v] === part && !hiddenViews.includes(v),
    )
  }, [viewLocations, hiddenViews])

  return (
    <div className="three-part-shell">
      {leftOpen ? (
        <CollapsiblePart
          side="left"
          open
          width={leftWidth}
          onToggle={() => togglePart('left')}
          onResize={(w) => setPartWidth('left', w)}
        />
      ) : (
        <Rail
          side="left"
          views={viewsIn('left')}
          onExpand={() => togglePart('left')}
          onActivateView={(v) => setActiveView('left', v)}
        />
      )}

      <div className="shell-part shell-part--center">
        <PartDockview part="center" />
      </div>

      {rightOpen ? (
        <CollapsiblePart
          side="right"
          open
          width={rightWidth}
          onToggle={() => togglePart('right')}
          onResize={(w) => setPartWidth('right', w)}
        />
      ) : (
        <Rail
          side="right"
          views={viewsIn('right')}
          onExpand={() => togglePart('right')}
          onActivateView={(v) => setActiveView('right', v)}
        />
      )}
    </div>
  )
}
