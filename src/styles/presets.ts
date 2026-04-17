// ============================================================
// Telepathy - Visual Presets (shape language, orthogonal to theme colors)
// Each preset only overrides "shape" tokens: spacing / radius / shadow /
// typography / sizing / motion. Colors come from themes.ts.
// ============================================================

export type PresetId = 'refined' | 'modern' | 'minimal'

export interface PresetDefinition {
  id: PresetId
  name: string
  description: string
  vars: Record<string, string>
}

// ---- Refined: Sourcetrail polished — compact, 1px borders, light shadows
const refined: PresetDefinition = {
  id: 'refined',
  name: 'Refined',
  description: 'Compact, tool-like, polished Sourcetrail look',
  vars: {
    '--space-1': '4px',
    '--space-2': '6px',
    '--space-3': '8px',
    '--space-4': '12px',
    '--space-5': '16px',
    '--space-6': '24px',

    '--radius-sm': '4px',
    '--radius-md': '6px',
    '--radius-lg': '8px',
    '--radius-pill': '999px',

    '--border-width': '1px',
    '--border-width-accent': '2px',

    '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.2)',
    '--shadow-md': '0 4px 12px rgba(0, 0, 0, 0.3)',
    '--shadow-lg': '0 8px 24px rgba(0, 0, 0, 0.4)',

    '--fs-xs': '11px',
    '--fs-sm': '12px',
    '--fs-md': '13px',
    '--fs-lg': '15px',
    '--fs-xl': '17px',

    '--fw-normal': '400',
    '--fw-medium': '500',
    '--fw-semibold': '600',
    '--fw-bold': '700',

    '--letter-spacing-tight': '0',
    '--letter-spacing-wide': '0.04em',

    '--header-h': '40px',
    '--tab-h': '28px',
    '--tab-bar-h': '32px',
    '--sidebar-tab-w': '28px',
    '--button-h-sm': '24px',
    '--button-h-md': '28px',

    '--dur-fast': '0.1s',
    '--dur-base': '0.15s',
    '--ease-out': 'cubic-bezier(0.2, 0.8, 0.2, 1)',

    '--node-border-width': '2px',
    '--node-hover-glow': '0 0 12px rgba(137, 180, 250, 0.2)',
    '--edge-width': '1.5px',
    '--edge-width-strong': '2px',
  },
}

// ---- Modern: Linear / Vercel — roomy, rounder, soft shadows, low-contrast borders
const modern: PresetDefinition = {
  id: 'modern',
  name: 'Modern',
  description: 'Soft, rounded, Linear-like breathing space',
  vars: {
    '--space-1': '4px',
    '--space-2': '8px',
    '--space-3': '12px',
    '--space-4': '16px',
    '--space-5': '20px',
    '--space-6': '28px',

    '--radius-sm': '6px',
    '--radius-md': '10px',
    '--radius-lg': '14px',
    '--radius-pill': '999px',

    '--border-width': '1px',
    '--border-width-accent': '2px',

    '--shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)',
    '--shadow-md': '0 4px 16px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12)',
    '--shadow-lg': '0 16px 48px rgba(0, 0, 0, 0.28), 0 6px 18px rgba(0, 0, 0, 0.18)',

    '--fs-xs': '11px',
    '--fs-sm': '12px',
    '--fs-md': '13px',
    '--fs-lg': '15px',
    '--fs-xl': '18px',

    '--fw-normal': '450',
    '--fw-medium': '550',
    '--fw-semibold': '650',
    '--fw-bold': '750',

    '--letter-spacing-tight': '-0.005em',
    '--letter-spacing-wide': '0.05em',

    '--header-h': '48px',
    '--tab-h': '30px',
    '--tab-bar-h': '38px',
    '--sidebar-tab-w': '44px',
    '--button-h-sm': '28px',
    '--button-h-md': '32px',

    '--dur-fast': '0.12s',
    '--dur-base': '0.2s',
    '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',

    '--node-border-width': '1.5px',
    '--node-hover-glow': '0 6px 18px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(137, 180, 250, 0.35)',
    '--edge-width': '1.75px',
    '--edge-width-strong': '2.5px',
  },
}

// ---- Minimal: Zed — sharp, near-square, almost no shadows, two-weight typography
const minimal: PresetDefinition = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Sharp, typography-driven, no-nonsense Zed feel',
  vars: {
    '--space-1': '4px',
    '--space-2': '6px',
    '--space-3': '8px',
    '--space-4': '10px',
    '--space-5': '14px',
    '--space-6': '20px',

    '--radius-sm': '2px',
    '--radius-md': '3px',
    '--radius-lg': '4px',
    '--radius-pill': '999px',

    '--border-width': '1px',
    '--border-width-accent': '2px',

    '--shadow-sm': 'none',
    '--shadow-md': '0 2px 6px rgba(0, 0, 0, 0.25)',
    '--shadow-lg': '0 4px 14px rgba(0, 0, 0, 0.35)',

    '--fs-xs': '11px',
    '--fs-sm': '12px',
    '--fs-md': '13px',
    '--fs-lg': '14px',
    '--fs-xl': '16px',

    '--fw-normal': '400',
    '--fw-medium': '400',
    '--fw-semibold': '700',
    '--fw-bold': '700',

    '--letter-spacing-tight': '0',
    '--letter-spacing-wide': '0.06em',

    '--header-h': '36px',
    '--tab-h': '26px',
    '--tab-bar-h': '30px',
    '--sidebar-tab-w': '32px',
    '--button-h-sm': '24px',
    '--button-h-md': '26px',

    '--dur-fast': '0.08s',
    '--dur-base': '0.1s',
    '--ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',

    '--node-border-width': '1.5px',
    '--node-hover-glow': 'none',
    '--edge-width': '1.25px',
    '--edge-width-strong': '2px',
  },
}

// ---- Registry ----

export const presets: PresetDefinition[] = [refined, modern, minimal]

export const defaultPresetId: PresetId = 'refined'

/** Apply a preset by setting CSS custom properties + data-preset attribute on :root */
export function applyPreset(presetId: string): void {
  const preset = presets.find(p => p.id === presetId) ?? presets[0]
  const root = document.documentElement
  for (const [prop, value] of Object.entries(preset.vars)) {
    root.style.setProperty(prop, value)
  }
  root.setAttribute('data-preset', preset.id)
}
