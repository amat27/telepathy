// ============================================================
// useTheme - Theme state hook with localStorage persistence
// ============================================================

import { useState, useEffect } from 'react'
import { applyTheme, defaultThemeId } from '../styles/themes'

const STORAGE_KEY = 'telepathy-theme'

export function useTheme() {
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? defaultThemeId
    } catch {
      return defaultThemeId
    }
  })

  useEffect(() => {
    applyTheme(themeId)
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch { /* ignore */ }
  }, [themeId])

  // Apply on mount
  useEffect(() => {
    applyTheme(themeId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { themeId, setThemeId }
}
