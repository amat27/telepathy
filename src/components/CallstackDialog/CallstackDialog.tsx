// ============================================================
// Callstack Dialog — paste a callstack to visualize as a graph
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import './CallstackDialog.css'

interface CallstackDialogProps {
  open: boolean
  onClose: () => void
}

export function CallstackDialog({ open, onClose }: CallstackDialogProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const loadCallstack = useAppStore(s => s.loadCallstack)

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) {
      setText('')
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    loadCallstack(trimmed)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
    // Ctrl+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (!open) return null

  return (
    <div className="callstack-overlay" onClick={onClose}>
      <div className="callstack-dialog" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="callstack-header">
          <h3>Paste Callstack</h3>
          <span className="callstack-hint">Ctrl+Enter to visualize</span>
        </div>
        <textarea
          ref={textareaRef}
          className="callstack-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Paste a callstack here, e.g.:\n\nmodule!TApplication::HandleEvent+0x42\nmodule!TMainForm::OnSaveClick+0x18\nmodule!TMSavePoint::Create+0x55`}
          spellCheck={false}
        />
        <div className="callstack-footer">
          <button className="callstack-btn cancel" onClick={onClose}>Cancel</button>
          <button className="callstack-btn submit" onClick={handleSubmit} disabled={!text.trim()}>
            Visualize
          </button>
        </div>
      </div>
    </div>
  )
}
