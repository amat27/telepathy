import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langCpp from 'shiki/langs/cpp.mjs'
import langC from 'shiki/langs/c.mjs'
import catppuccinMocha from 'shiki/themes/catppuccin-mocha.mjs'

export interface HighlightToken {
  content: string
  color: string
}

/** Catppuccin Mocha foreground fallback */
const FOREGROUND = '#cdd6f4'

const highlighter = createHighlighterCoreSync({
  themes: [catppuccinMocha],
  langs: [langC, langCpp],
  engine: createJavaScriptRegexEngine(),
})

/**
 * Highlight source code using Shiki with Catppuccin Mocha theme.
 *
 * @param code  Raw source text (no line numbers — caller strips those)
 * @param lang  Language grammar to use (default: 'cpp')
 * @returns     Array of lines, each line an array of tokens with content + color
 */
export function highlightCode(code: string, lang: 'cpp' | 'c' = 'cpp'): HighlightToken[][] {
  const { tokens } = highlighter.codeToTokens(code, {
    lang,
    theme: 'catppuccin-mocha',
  })
  return tokens.map(line =>
    line.map(token => ({
      content: token.content,
      color: token.color || FOREGROUND,
    }))
  )
}
