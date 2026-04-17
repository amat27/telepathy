// ============================================================
// AppearanceMenu - Unified dropdown for Theme (colors) + Preset (shape)
// Replaces the former ThemeMenu. Lives under the old file to keep
// import paths stable.
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { themes } from '../../styles/themes'
import type { ThemeDefinition } from '../../styles/themes'
import { presets } from '../../styles/presets'
import type { PresetDefinition, PresetId } from '../../styles/presets'
import { Palette, Check } from '../icons'
import './ThemeMenu.css'

interface AppearanceMenuProps {
  currentThemeId: string
  onSelectTheme: (themeId: string) => void
  currentPresetId: PresetId
  onSelectPreset: (presetId: PresetId) => void
}

export function AppearanceMenu({
  currentThemeId,
  onSelectTheme,
  currentPresetId,
  onSelectPreset,
}: AppearanceMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
        title="Appearance"
        aria-label="Appearance"
      >
        <Palette size={16} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="theme-dropdown">
          {/* Preset section */}
          <div className="theme-group-label">Style</div>
          {presets.map(p => (
            <PresetOption
              key={p.id}
              preset={p}
              isActive={p.id === currentPresetId}
              onSelect={() => { onSelectPreset(p.id); }}
            />
          ))}

          <div className="theme-divider" />

          {/* Theme section */}
          <div className="theme-group-label">Dark Theme</div>
          {darkThemes.map(t => (
            <ThemeOption
              key={t.id}
              theme={t}
              isActive={t.id === currentThemeId}
              onSelect={() => { onSelectTheme(t.id); }}
            />
          ))}
          <div className="theme-group-label">Light Theme</div>
          {lightThemes.map(t => (
            <ThemeOption
              key={t.id}
              theme={t}
              isActive={t.id === currentThemeId}
              onSelect={() => { onSelectTheme(t.id); }}
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
      {isActive && <Check size={14} className="theme-check" strokeWidth={2.25} />}
    </button>
  )
}

function PresetOption({
  preset,
  isActive,
  onSelect,
}: {
  preset: PresetDefinition
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`theme-option preset-option ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      title={preset.description}
    >
      <span className={`preset-preview preset-preview-${preset.id}`}>
        <span className="preset-preview-bar" />
        <span className="preset-preview-dot" />
      </span>
      <span className="theme-name">
        <span className="preset-name">{preset.name}</span>
        <span className="preset-desc">{preset.description}</span>
      </span>
      {isActive && <Check size={14} className="theme-check" strokeWidth={2.25} />}
    </button>
  )
}

// ---- Backward-compat shim: keep old <ThemeMenu> exports working ----
// Will be removed once App.tsx is updated.
interface ThemeMenuProps {
  currentThemeId: string
  onSelect: (themeId: string) => void
}
export function ThemeMenu(_props: ThemeMenuProps) {
  // Kept as a no-op placeholder; App now uses AppearanceMenu directly.
  return null
}
