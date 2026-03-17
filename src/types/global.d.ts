// ============================================================
// Global type declaration for window.telepathy
// ============================================================

import type { TelepathyAPI } from '../../electron/preload'

declare global {
  interface Window {
    telepathy: TelepathyAPI
  }
}
