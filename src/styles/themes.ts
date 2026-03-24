// ============================================================
// Telepathy - Theme Definitions
// Each theme provides a complete set of CSS custom properties
// ============================================================

export interface ThemeDefinition {
  id: string
  name: string
  group: 'dark' | 'light'
  vars: Record<string, string>
}

// ---- Dark Themes ----

const catppuccinMocha: ThemeDefinition = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  group: 'dark',
  vars: {
    '--bg-primary': '#1e1e2e',
    '--bg-secondary': '#181825',
    '--bg-surface': '#252536',
    '--bg-hover': '#313244',
    '--bg-active': '#45475a',
    '--text-primary': '#cdd6f4',
    '--text-secondary': '#a6adc8',
    '--text-muted': '#6c7086',
    '--text-accent': '#89b4fa',
    '--border-color': '#313244',
    '--border-focus': '#89b4fa',
    '--color-class': '#f9e2af',
    '--color-struct': '#a6e3a1',
    '--color-function': '#89b4fa',
    '--color-member': '#cba6f7',
    '--color-enum': '#fab387',
    '--color-namespace': '#94e2d5',
    '--color-typedef': '#f38ba8',
    '--color-macro': '#eba0ac',
    '--color-inherit-edge': '#f9e2af',
    '--color-call-edge': '#89b4fa',
    '--color-type-edge': '#cba6f7',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#cdd6f4',
    '--shiki-background': '#1e1e2e',
    '--shiki-token-keyword': '#cba6f7',
    '--shiki-token-string': '#a6e3a1',
    '--shiki-token-string-expression': '#a6e3a1',
    '--shiki-token-comment': '#6c7086',
    '--shiki-token-function': '#89b4fa',
    '--shiki-token-constant': '#fab387',
    '--shiki-token-parameter': '#f2cdcd',
    '--shiki-token-punctuation': '#9399b2',
    '--shiki-token-link': '#89b4fa',
  },
}

const oneDark: ThemeDefinition = {
  id: 'one-dark',
  name: 'One Dark',
  group: 'dark',
  vars: {
    '--bg-primary': '#282c34',
    '--bg-secondary': '#21252b',
    '--bg-surface': '#2c313a',
    '--bg-hover': '#3a3f4b',
    '--bg-active': '#4b5263',
    '--text-primary': '#abb2bf',
    '--text-secondary': '#9198a7',
    '--text-muted': '#5c6370',
    '--text-accent': '#61afef',
    '--border-color': '#3a3f4b',
    '--border-focus': '#61afef',
    '--color-class': '#e5c07b',
    '--color-struct': '#98c379',
    '--color-function': '#61afef',
    '--color-member': '#c678dd',
    '--color-enum': '#d19a66',
    '--color-namespace': '#56b6c2',
    '--color-typedef': '#e06c75',
    '--color-macro': '#be5046',
    '--color-inherit-edge': '#e5c07b',
    '--color-call-edge': '#61afef',
    '--color-type-edge': '#c678dd',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#abb2bf',
    '--shiki-background': '#282c34',
    '--shiki-token-keyword': '#c678dd',
    '--shiki-token-string': '#98c379',
    '--shiki-token-string-expression': '#98c379',
    '--shiki-token-comment': '#5c6370',
    '--shiki-token-function': '#61afef',
    '--shiki-token-constant': '#d19a66',
    '--shiki-token-parameter': '#e06c75',
    '--shiki-token-punctuation': '#abb2bf',
    '--shiki-token-link': '#61afef',
  },
}

const tokyoNight: ThemeDefinition = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  group: 'dark',
  vars: {
    '--bg-primary': '#1a1b26',
    '--bg-secondary': '#16161e',
    '--bg-surface': '#1f2335',
    '--bg-hover': '#292e42',
    '--bg-active': '#3b4261',
    '--text-primary': '#c0caf5',
    '--text-secondary': '#a9b1d6',
    '--text-muted': '#565f89',
    '--text-accent': '#7aa2f7',
    '--border-color': '#292e42',
    '--border-focus': '#7aa2f7',
    '--color-class': '#e0af68',
    '--color-struct': '#9ece6a',
    '--color-function': '#7aa2f7',
    '--color-member': '#bb9af7',
    '--color-enum': '#ff9e64',
    '--color-namespace': '#73daca',
    '--color-typedef': '#f7768e',
    '--color-macro': '#db4b4b',
    '--color-inherit-edge': '#e0af68',
    '--color-call-edge': '#7aa2f7',
    '--color-type-edge': '#bb9af7',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#c0caf5',
    '--shiki-background': '#1a1b26',
    '--shiki-token-keyword': '#bb9af7',
    '--shiki-token-string': '#9ece6a',
    '--shiki-token-string-expression': '#9ece6a',
    '--shiki-token-comment': '#565f89',
    '--shiki-token-function': '#7aa2f7',
    '--shiki-token-constant': '#ff9e64',
    '--shiki-token-parameter': '#e0af68',
    '--shiki-token-punctuation': '#9aa5ce',
    '--shiki-token-link': '#7aa2f7',
  },
}

// ---- Light Themes ----

const catppuccinLatte: ThemeDefinition = {
  id: 'catppuccin-latte',
  name: 'Catppuccin Latte',
  group: 'light',
  vars: {
    '--bg-primary': '#eff1f5',
    '--bg-secondary': '#e6e9ef',
    '--bg-surface': '#dce0e8',
    '--bg-hover': '#ccd0da',
    '--bg-active': '#bcc0cc',
    '--text-primary': '#4c4f69',
    '--text-secondary': '#5c5f77',
    '--text-muted': '#8c8fa1',
    '--text-accent': '#1e66f5',
    '--border-color': '#ccd0da',
    '--border-focus': '#1e66f5',
    '--color-class': '#df8e1d',
    '--color-struct': '#40a02b',
    '--color-function': '#1e66f5',
    '--color-member': '#8839ef',
    '--color-enum': '#fe640b',
    '--color-namespace': '#179299',
    '--color-typedef': '#d20f39',
    '--color-macro': '#e64553',
    '--color-inherit-edge': '#df8e1d',
    '--color-call-edge': '#1e66f5',
    '--color-type-edge': '#8839ef',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#4c4f69',
    '--shiki-background': '#eff1f5',
    '--shiki-token-keyword': '#8839ef',
    '--shiki-token-string': '#40a02b',
    '--shiki-token-string-expression': '#40a02b',
    '--shiki-token-comment': '#8c8fa1',
    '--shiki-token-function': '#1e66f5',
    '--shiki-token-constant': '#fe640b',
    '--shiki-token-parameter': '#dd7878',
    '--shiki-token-punctuation': '#7c7f93',
    '--shiki-token-link': '#1e66f5',
  },
}

const githubLight: ThemeDefinition = {
  id: 'github-light',
  name: 'GitHub Light',
  group: 'light',
  vars: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f6f8fa',
    '--bg-surface': '#eaeef2',
    '--bg-hover': '#d0d7de',
    '--bg-active': '#b8c0c8',
    '--text-primary': '#1f2328',
    '--text-secondary': '#424a53',
    '--text-muted': '#6e7781',
    '--text-accent': '#0969da',
    '--border-color': '#d0d7de',
    '--border-focus': '#0969da',
    '--color-class': '#953800',
    '--color-struct': '#116329',
    '--color-function': '#0550ae',
    '--color-member': '#8250df',
    '--color-enum': '#bc4c00',
    '--color-namespace': '#0a3069',
    '--color-typedef': '#cf222e',
    '--color-macro': '#a40e26',
    '--color-inherit-edge': '#953800',
    '--color-call-edge': '#0550ae',
    '--color-type-edge': '#8250df',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#1f2328',
    '--shiki-background': '#ffffff',
    '--shiki-token-keyword': '#cf222e',
    '--shiki-token-string': '#0a3069',
    '--shiki-token-string-expression': '#0a3069',
    '--shiki-token-comment': '#6e7781',
    '--shiki-token-function': '#8250df',
    '--shiki-token-constant': '#0550ae',
    '--shiki-token-parameter': '#953800',
    '--shiki-token-punctuation': '#1f2328',
    '--shiki-token-link': '#0969da',
  },
}

const solarizedLight: ThemeDefinition = {
  id: 'solarized-light',
  name: 'Solarized Light',
  group: 'light',
  vars: {
    '--bg-primary': '#fdf6e3',
    '--bg-secondary': '#eee8d5',
    '--bg-surface': '#e4ddc8',
    '--bg-hover': '#d6cfb8',
    '--bg-active': '#c9c2a8',
    '--text-primary': '#586e75',
    '--text-secondary': '#657b83',
    '--text-muted': '#93a1a1',
    '--text-accent': '#268bd2',
    '--border-color': '#d6cfb8',
    '--border-focus': '#268bd2',
    '--color-class': '#b58900',
    '--color-struct': '#859900',
    '--color-function': '#268bd2',
    '--color-member': '#6c71c4',
    '--color-enum': '#cb4b16',
    '--color-namespace': '#2aa198',
    '--color-typedef': '#dc322f',
    '--color-macro': '#d33682',
    '--color-inherit-edge': '#b58900',
    '--color-call-edge': '#268bd2',
    '--color-type-edge': '#6c71c4',
    // Shiki syntax highlighting tokens
    '--shiki-foreground': '#586e75',
    '--shiki-background': '#fdf6e3',
    '--shiki-token-keyword': '#859900',
    '--shiki-token-string': '#2aa198',
    '--shiki-token-string-expression': '#2aa198',
    '--shiki-token-comment': '#93a1a1',
    '--shiki-token-function': '#268bd2',
    '--shiki-token-constant': '#cb4b16',
    '--shiki-token-parameter': '#b58900',
    '--shiki-token-punctuation': '#586e75',
    '--shiki-token-link': '#268bd2',
  },
}

// ---- Registry ----

export const themes: ThemeDefinition[] = [
  catppuccinMocha,
  oneDark,
  tokyoNight,
  catppuccinLatte,
  githubLight,
  solarizedLight,
]

export const defaultThemeId = 'catppuccin-mocha'

/** Apply a theme by setting CSS custom properties on :root */
export function applyTheme(themeId: string): void {
  const theme = themes.find(t => t.id === themeId) ?? themes[0]
  const root = document.documentElement
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value)
  }
  root.setAttribute('data-theme', theme.id)
  root.setAttribute('data-theme-group', theme.group)
}
