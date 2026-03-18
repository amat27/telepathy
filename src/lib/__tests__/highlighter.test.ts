import { describe, it, expect } from 'vitest'
import { highlightCode, HighlightToken } from '../highlighter'

const FOREGROUND = '#cdd6f4'

describe('highlightCode', () => {
  it('returns an array of token lines for valid C++ code', () => {
    const result = highlightCode('int main() { return 0; }')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // Each line is an array of tokens
    for (const line of result) {
      expect(Array.isArray(line)).toBe(true)
    }
  })

  it('each token has content (string) and color (string) properties', () => {
    const result = highlightCode('int x = 42;')
    for (const line of result) {
      for (const token of line) {
        expect(typeof token.content).toBe('string')
        expect(typeof token.color).toBe('string')
        // Color should be a hex color
        expect(token.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('returns plain tokens for empty string input', () => {
    const result = highlightCode('')
    expect(Array.isArray(result)).toBe(true)
    // Should still return at least one line (empty line)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles code with special characters (angle brackets, ampersands)', () => {
    const code = 'std::vector<int>& ref = getVec<float>();'
    const result = highlightCode(code)
    expect(result.length).toBeGreaterThan(0)
    // Reconstruct the text from tokens and verify it matches original
    const reconstructed = result.map(line => line.map(t => t.content).join('')).join('\n')
    expect(reconstructed).toBe(code)
  })

  it('C++ keywords get different color than plain identifiers', () => {
    const result = highlightCode('int myVariable = 42;')
    // Flatten to find the 'int' keyword token and identifier token
    const allTokens = result.flat()

    const intToken = allTokens.find(t => t.content.trim() === 'int')
    const identToken = allTokens.find(t => t.content.trim() === 'myVariable')

    expect(intToken).toBeDefined()
    expect(identToken).toBeDefined()

    // Keyword should have a non-foreground color (Shiki highlights it)
    expect(intToken!.color).not.toBe(FOREGROUND)
    // Keyword and identifier should have different colors
    expect(intToken!.color).not.toBe(identToken!.color)
  })

  it('preserves multiline code structure', () => {
    const code = 'int main() {\n  return 0;\n}'
    const result = highlightCode(code)
    expect(result.length).toBe(3) // 3 lines
    // Each line should reconstruct correctly
    const lines = code.split('\n')
    for (let i = 0; i < result.length; i++) {
      const reconstructed = result[i].map(t => t.content).join('')
      expect(reconstructed).toBe(lines[i])
    }
  })
})
