// ============================================================
// Callstack Parser — extract Class::Method from pasted text
// Handles WinDbg, Visual Studio, GDB, and freeform formats
// ============================================================

/** Raw parsed entry before resolution against the DB */
export interface CallstackEntry {
  /** Identifier chain split on '::', e.g. ["Namespace", "Class", "Method"]. Null if no '::' found */
  segments: string[] | null
  /** Display label (cleaned symbol name) */
  label: string
  /** Original line text */
  raw: string
}

/** Frame after resolution — covers both resolved and unresolved entries */
export interface CallstackFrame {
  /** Resolved class name, or null if unresolved */
  className: string | null
  /** Resolved class id, or null if unresolved */
  classId: string | null
  /** Method name (first identifier after matched class), or null */
  methodName: string | null
  /** Display label (cleaned symbol name) */
  label: string
  /** Original line text */
  raw: string
}

/** @deprecated Use CallstackFrame instead */
export type ResolvedCallstackEntry = CallstackFrame

// ---- Internal helpers ----

/**
 * Split a qualified name on '::' while respecting <> nesting.
 * E.g. "A<X::Y>::B::C" → ["A<X::Y>", "B", "C"]
 */
export function splitQualified(symbol: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (let i = 0; i < symbol.length; i++) {
    const ch = symbol[i]
    if (ch === '<') depth++
    else if (ch === '>') depth = Math.max(0, depth - 1)

    if (depth === 0 && ch === ':' && i + 1 < symbol.length && symbol[i + 1] === ':') {
      if (current) parts.push(current)
      current = ''
      i++ // skip second ':'
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts
}

/**
 * Preprocess a raw callstack line: strips frame markers, module prefixes,
 * language suffixes, offsets, parameter lists, line numbers.
 * Returns the cleaned symbol string, or null if the line should be skipped.
 */
export function preprocessLine(line: string): string | null {
  let s = line

  // 1. Strip leading '>' (VS current-frame marker) and whitespace/tabs
  s = s.replace(/^[>\s\t]+/, '')
  // 2. Strip trailing whitespace/tabs
  s = s.replace(/[\s\t]+$/, '')

  if (!s) return null

  // 3. Skip [External Code] and similar bracketed markers
  if (/^\[.*\]$/.test(s)) return null

  // 4. Strip trailing language tag: "\tC++", "\tC#" etc. (VS debugger format)
  s = s.replace(/\t[A-Za-z+#]+\s*$/, '')
  // Fallback when tabs are expanded to spaces
  s = s.replace(/\s{2,}C\+\+\s*$/, '')

  // 5. Strip VS "Line NNN" suffix
  s = s.replace(/\s+Line\s+\d+.*$/, '')

  // 6. Module separator: "MyApp.exe!Symbol" → "Symbol"
  const bangIdx = s.indexOf('!')
  if (bangIdx >= 0) {
    s = s.substring(bangIdx + 1)
  }

  // 7. Strip parenthesized parameter lists: "Create(int x)" → "Create"
  s = s.replace(/\([^)]*\)/g, '')

  // 8. Strip WinDbg "+0xHEX" offset
  s = s.replace(/\+0x[0-9a-fA-F]+$/, '')

  // 9. GDB: strip " at file:line"
  s = s.replace(/\s+at\s+\S+$/, '')

  // 10. Strip leading frame numbers: "#0 ", "00 " etc.
  s = s.replace(/^#?\d+\s+/, '')

  s = s.trim()
  return s || null
}

/**
 * Parse callstack text into entries by extracting qualified symbol names.
 *
 * Handles Visual Studio debugger format, WinDbg, GDB, and freeform text.
 * Lines like [External Code] are skipped. Lines without '::' are included
 * as standalone entries (segments=null) if they look like a valid symbol.
 */
export function parseCallstack(text: string): CallstackEntry[] {
  const lines = text.split(/\r?\n/)
  const entries: CallstackEntry[] = []

  for (const line of lines) {
    const raw = line.trim()
    if (!raw) continue

    const cleaned = preprocessLine(line)
    if (!cleaned) continue

    const segments = splitQualified(cleaned)

    if (segments.length >= 2) {
      entries.push({ segments, label: cleaned, raw })
    } else if (segments.length === 1 && !/\s/.test(segments[0])) {
      // Single valid symbol without '::' (e.g. standalone function, template)
      entries.push({ segments: null, label: cleaned, raw })
    }
  }

  return entries
}

/**
 * Resolve parsed entries against known classes from the database.
 *
 * For each entry with segments, tries ALL possible split points between
 * class and method. Prefers longer class matches (rightmost split) and
 * full-qualified names over shorter suffixes.
 *
 * Returns a frame for EVERY entry — unresolved entries have null classId/className.
 */
export function resolveCallstack(
  entries: CallstackEntry[],
  knownClasses: Map<string, string>, // name → id
): CallstackFrame[] {
  const frames: CallstackFrame[] = []

  for (const entry of entries) {
    if (!entry.segments || entry.segments.length < 2) {
      // No '::' segments — unresolved standalone symbol
      frames.push({
        className: null,
        classId: null,
        methodName: null,
        label: entry.label,
        raw: entry.raw,
      })
      continue
    }

    let resolved = false

    // Try split points from right to left (prefer more segments as class name).
    // split = index of the first method segment.
    // At each split point, try progressively shorter class prefixes
    // (removing leading namespace segments).
    for (let split = entry.segments.length - 1; split >= 1 && !resolved; split--) {
      for (let start = 0; start < split && !resolved; start++) {
        const className = entry.segments.slice(start, split).join('::')
        const classId = knownClasses.get(className)
        if (classId) {
          const methodName = entry.segments[split]
          frames.push({
            className,
            classId,
            methodName,
            label: entry.label,
            raw: entry.raw,
          })
          resolved = true
        }
      }
    }

    if (!resolved) {
      frames.push({
        className: null,
        classId: null,
        methodName: null,
        label: entry.label,
        raw: entry.raw,
      })
    }
  }

  return frames
}
