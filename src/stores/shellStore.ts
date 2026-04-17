// ============================================================
// Shell Store
// Global dock-shell state: which view lives in which Part,
// fold state and width per side. Independent of appStore to keep
// POC blast radius small. Persisted to localStorage.
// ============================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  ALL_VIEW_IDS,
  getDefaultLocations,
  type ViewId,
  type PartId,
} from '../views/registry'

export interface ShellState {
  // viewLocations[viewId] = which Part the view currently lives in
  viewLocations: Record<ViewId, PartId>
  // Hidden views (not currently shown anywhere)
  hiddenViews: ViewId[]
  // Side Part fold state
  leftOpen: boolean
  rightOpen: boolean
  // Side Part widths (px, only used when open)
  leftWidth: number
  rightWidth: number
  // Active view per Part (for tab-switching when multiple views in a Part)
  activeView: Record<PartId, ViewId | null>

  // Actions
  moveView: (viewId: ViewId, target: PartId) => void
  hideView: (viewId: ViewId) => void
  showView: (viewId: ViewId, target?: PartId) => void
  togglePart: (side: 'left' | 'right') => void
  setPartOpen: (side: 'left' | 'right', open: boolean) => void
  setPartWidth: (side: 'left' | 'right', width: number) => void
  setActiveView: (part: PartId, viewId: ViewId | null) => void
  resetLayout: () => void
}

const DEFAULT_LEFT_WIDTH = 260
const DEFAULT_RIGHT_WIDTH = 320
const MIN_WIDTH = 180
const MAX_WIDTH = 600

function pickActive(
  viewLocations: Record<ViewId, PartId>,
  hidden: ViewId[],
): Record<PartId, ViewId | null> {
  const result: Record<PartId, ViewId | null> = { left: null, center: null, right: null }
  for (const vid of ALL_VIEW_IDS) {
    if (hidden.includes(vid)) continue
    const part = viewLocations[vid]
    if (!result[part]) result[part] = vid
  }
  return result
}

export const useShellStore = create<ShellState>()(
  persist(
    (set, get) => {
      const initialLocations = getDefaultLocations()
      return {
        viewLocations: initialLocations,
        hiddenViews: [],
        leftOpen: true,
        rightOpen: true,
        leftWidth: DEFAULT_LEFT_WIDTH,
        rightWidth: DEFAULT_RIGHT_WIDTH,
        activeView: pickActive(initialLocations, []),

        moveView: (viewId, target) => {
          const state = get()
          const newLocations = { ...state.viewLocations, [viewId]: target }
          // If view was hidden, un-hide it
          const newHidden = state.hiddenViews.filter(v => v !== viewId)
          // Make moved view active in target Part
          const newActive = { ...pickActive(newLocations, newHidden), [target]: viewId }
          set({
            viewLocations: newLocations,
            hiddenViews: newHidden,
            activeView: newActive,
          })
        },

        hideView: (viewId) => {
          const state = get()
          if (state.hiddenViews.includes(viewId)) return
          const newHidden = [...state.hiddenViews, viewId]
          set({
            hiddenViews: newHidden,
            activeView: pickActive(state.viewLocations, newHidden),
          })
        },

        showView: (viewId, target) => {
          const state = get()
          const newHidden = state.hiddenViews.filter(v => v !== viewId)
          const newLocations = target
            ? { ...state.viewLocations, [viewId]: target }
            : state.viewLocations
          set({
            viewLocations: newLocations,
            hiddenViews: newHidden,
            activeView: { ...pickActive(newLocations, newHidden), [newLocations[viewId]]: viewId },
          })
        },

        togglePart: (side) => {
          const key = side === 'left' ? 'leftOpen' : 'rightOpen'
          set({ [key]: !get()[key] } as Partial<ShellState>)
        },

        setPartOpen: (side, open) => {
          const key = side === 'left' ? 'leftOpen' : 'rightOpen'
          set({ [key]: open } as Partial<ShellState>)
        },

        setPartWidth: (side, width) => {
          const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)))
          const key = side === 'left' ? 'leftWidth' : 'rightWidth'
          set({ [key]: clamped } as Partial<ShellState>)
        },

        setActiveView: (part, viewId) => {
          set(state => ({ activeView: { ...state.activeView, [part]: viewId } }))
        },

        resetLayout: () => {
          const initialLocations = getDefaultLocations()
          set({
            viewLocations: initialLocations,
            hiddenViews: [],
            leftOpen: true,
            rightOpen: true,
            leftWidth: DEFAULT_LEFT_WIDTH,
            rightWidth: DEFAULT_RIGHT_WIDTH,
            activeView: pickActive(initialLocations, []),
          })
        },
      }
    },
    {
      name: 'telepathy-shell',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
