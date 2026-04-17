// ============================================================
// MoveMenu — dropdown menu rendered in dockview tab actions slot.
// Lets user move the view to another Part or hide it.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from '../icons'
import { useShellStore } from '../../stores/shellStore'
import type { ViewId, PartId } from '../../views/registry'

interface MoveMenuProps {
  viewId: ViewId
  currentPart: PartId
}

const PART_LABELS: Record<PartId, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

export function MoveMenu({ viewId, currentPart }: MoveMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const moveView = useShellStore(s => s.moveView)
  const hideView = useShellStore(s => s.hideView)
  const setPartOpen = useShellStore(s => s.setPartOpen)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleMove = (target: PartId) => {
    if (target !== currentPart) {
      moveView(viewId, target)
      // Auto-open destination Part if it was collapsed
      if (target === 'left') setPartOpen('left', true)
      if (target === 'right') setPartOpen('right', true)
    }
    setOpen(false)
  }

  const handleHide = () => {
    hideView(viewId)
    setOpen(false)
  }

  return (
    <div className="shell-move-menu" ref={ref}>
      <button
        className="shell-move-menu-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(o => !o)
        }}
        title="View options"
        aria-label="View options"
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="shell-move-menu-dropdown" onClick={(e) => e.stopPropagation()}>
          {(['left', 'center', 'right'] as PartId[]).map(part => (
            <button
              key={part}
              className="shell-move-menu-item"
              onClick={() => handleMove(part)}
              disabled={part === currentPart}
            >
              Move to {PART_LABELS[part]}
              {part === currentPart && ' (current)'}
            </button>
          ))}
          <div className="shell-move-menu-divider" />
          <button className="shell-move-menu-item" onClick={handleHide}>
            Hide
          </button>
        </div>
      )}
    </div>
  )
}
