// ============================================================
// ThemeMenu - Dropdown theme picker
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { themes } from '../../styles/themes'
import type { ThemeDefinition } from '../../styles/themes'
import './ThemeMenu.css'

interface ThemeMenuProps {
  currentThemeId: string
  onSelect: (themeId: string) => void
}

export function ThemeMenu({ currentThemeId, onSelect }: ThemeMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const darkThemes = themes.filter(t => t.group === 'dark')
  const lightThemes = themes.filter(t => t.group === 'light')

  return (
    <div className="theme-menu" ref={menuRef}>
      <button
        className="nav-btn theme-toggle-btn"
        onClick={() => setOpen(!open)}
        title="Change theme"
      >
        &#x1F3A8;
      </button>

      {open && (
        <div className="theme-dropdown">
          <div className="theme-group-label">Dark</div>
          {darkThemes.map(t => (
            <ThemeOption
              key={t.id}
              theme={t}
              isActive={t.id === currentThemeId}
              onSelect={() => { onSelect(t.id); setOpen(false) }}
            />
          ))}
          <div className="theme-group-label">Light</div>
          {lightThemes.map(t => (
            <ThemeOption
              key={t.id}
              theme={t}
              isActive={t.id === currentThemeId}
              onSelect={() => { onSelect(t.id); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ThemeOption({
  theme,
  isActive,
  onSelect,
}: {
  theme: ThemeDefinition
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`theme-option ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <span className="theme-swatch">
        <span className="swatch-bg" style={{ background: theme.vars['--bg-primary'] }} />
        <span className="swatch-accent" style={{ background: theme.vars['--text-accent'] }} />
      </span>
      <span className="theme-name">{theme.name}</span>
      {isActive && <span className="theme-check">&#x2713;</span>}
    </button>
  )
}
