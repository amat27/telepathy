// ============================================================
// Shiki Syntax Highlighter — singleton, CSS-variable-themed
// Uses fine-grained imports for small bundle (~100KB total)
// ============================================================

import { createHighlighterCoreSync, createCssVariablesTheme } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import c from '@shikijs/langs/c'
import cpp from '@shikijs/langs/cpp'

export interface HighlightToken {
  content: string
  color: string      // e.g. "var(--shiki-token-keyword)"
  fontStyle: number  // 0=none, 1=italic, 2=bold, 4=underline (bitmask)
}

// CSS-variable theme — token colors come from our theme system
const cssVarsTheme = createCssVariablesTheme({
  variablePrefix: '--shiki-',
})

// Singleton highlighter — created once, reused everywhere
const highlighter = createHighlighterCoreSync({
  themes: [cssVarsTheme],
  langs: [c, cpp],
  engine: createJavaScriptRegexEngine(),
})

/**
 * Detect language from file extension.
 * Returns 'cpp' for C++ files, 'c' for C files, or null if unsupported.
 */
export function detectLang(filePath: string | null): string | null {
  if (!filePath) return null
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'cpp': case 'cxx': case 'cc': case 'c++':
    case 'hpp': case 'hxx': case 'hh': case 'h++':
    case 'h': case 'inl': case 'ipp':
      return 'cpp'
    case 'c':
      return 'c'
    default:
      return null
  }
}

/**
 * Tokenize source code using Shiki.
 * Returns array of lines, each line is array of tokens.
 * Token colors reference CSS variables (--shiki-token-keyword, etc.)
 */
export function highlightCode(code: string, lang: string): HighlightToken[][] {
  const result = highlighter.codeToTokens(code, {
    lang,
    theme: 'css-variables',
  })
  return result.tokens as HighlightToken[][]
}
