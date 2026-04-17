// ============================================================
// usePreset - Visual preset state hook (shape language)
// Orthogonal to useTheme (which handles colors).
// ============================================================

import { useState, useEffect } from 'react'
import { applyPreset, defaultPresetId } from '../styles/presets'
import type { PresetId } from '../styles/presets'

const STORAGE_KEY = 'telepathy-preset'

export function usePreset() {
  const [presetId, setPresetId] = useState<PresetId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'refined' || saved === 'modern' || saved === 'minimal') {
        return saved
      }
      return defaultPresetId
    } catch {
      return defaultPresetId
    }
  })

  useEffect(() => {
    applyPreset(presetId)
    try {
      localStorage.setItem(STORAGE_KEY, presetId)
    } catch { /* ignore */ }
  }, [presetId])

  // Apply on mount
  useEffect(() => {
    applyPreset(presetId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { presetId, setPresetId }
}
