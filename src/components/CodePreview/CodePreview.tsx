// ============================================================
// Code Preview (Right Panel) - Member list + source code
// ============================================================

import { useRef, useEffect, useCallback, useState, useMemo, forwardRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { CodeSymbol } from '../../types/model'
import { highlightCode, detectLang } from '../../lib/highlighter'
import type { HighlightToken } from '../../lib/highlighter'
import './CodePreview.css'

type SortKey = 'name' | 'kind' | 'line'
type GroupMode = 'none' | 'kind' | 'origin'

export function CodePreview() {
  const { selectedClass, previewedClass, selectedMember, selectedMembers, sourceCode, sourceFile, sourceLine, selectMember, toggleMember } = useAppStore()
  const displayClass = previewedClass ?? selectedClass
  const sourceRef = useRef<HTMLPreElement>(null)

  // Local UI state for member list controls
  const [memberFilter, setMemberFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('line')
  const [groupBy, setGroupBy] = useState<GroupMode>('none')

  // Reset filter when class changes
  useEffect(() => {
    setMemberFilter('')
  }, [displayClass?.id])

  // Scroll to the highlighted line when source changes
  useEffect(() => {
    if (sourceRef.current && sourceLine > 0) {
      const lineEl = sourceRef.current.querySelector(`[data-line="${sourceLine}"]`)
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [sourceCode, sourceLine])

  // Filter + sort members
  const processedMembers = useMemo(() => {
    if (!displayClass?.members) return []
    let list = displayClass.members

    // Filter
    if (memberFilter) {
      const lc = memberFilter.toLowerCase()
      list = list.filter(m =>
        m.name.toLowerCase().includes(lc) ||
        (m.returnType && m.returnType.toLowerCase().includes(lc))
      )
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name)
        case 'kind': return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
        case 'line': return (a.location?.line ?? 0) - (b.location?.line ?? 0)
      }
    })

    return list
  }, [displayClass?.members, memberFilter, sortBy])

  // Group members by kind or origin
  const groupedMembers = useMemo(() => {
    if (groupBy === 'none') return null

    const groups = new Map<string, CodeSymbol[]>()
    for (const m of processedMembers) {
      const key = groupBy === 'origin'
        ? (m.inheritedFrom ? `Inherited from ${m.inheritedFrom}` : 'Own Members')
        : kindGroupLabel(m.kind)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }

    // For origin mode, put "Own Members" first
    if (groupBy === 'origin') {
      const sorted = new Map<string, CodeSymbol[]>()
      if (groups.has('Own Members')) {
        sorted.set('Own Members', groups.get('Own Members')!)
        groups.delete('Own Members')
      }
      for (const [k, v] of groups) sorted.set(k, v)
      return sorted
    }

    return groups
  }, [processedMembers, groupBy])

  if (!displayClass) {
    return (
      <div className="code-preview-empty">
        <p>Select a class to view details</p>
      </div>
    )
  }

  const totalCount = displayClass.members?.length ?? 0
  const filteredCount = processedMembers.length

  const handleMemberClick = (member: CodeSymbol, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click toggles selection for graph display
      toggleMember(member)
    } else {
      selectMember(member)
    }
  }

  return (
    <div className="code-preview">
      <div className="code-header">
        <span className="code-title">{displayClass.name}</span>
        {sourceFile && (
          <span className="code-path" title={sourceFile}>
            {sourceFile.split(/[\\/]/).slice(-3).join('/')}
          </span>
        )}
      </div>

      {/* Members section */}
      {totalCount > 0 && (
        <div className="members-section">
          <div className="members-toolbar">
            <input
              type="text"
              className="member-filter"
              placeholder="Filter members..."
              value={memberFilter}
              onChange={e => setMemberFilter(e.target.value)}
            />
            <div className="member-controls">
              <select
                className="member-sort"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                title="Sort by"
              >
                <option value="line">Line</option>
                <option value="name">Name</option>
                <option value="kind">Kind</option>
              </select>
              <button
                className={`member-group-btn ${groupBy !== 'none' ? 'active' : ''}`}
                onClick={() => setGroupBy(g => g === 'none' ? 'kind' : g === 'kind' ? 'origin' : 'none')}
                title={`Group: ${groupBy === 'none' ? 'off' : groupBy} (click to cycle)`}
              >
                {groupBy === 'none' ? 'G' : groupBy === 'kind' ? 'K' : 'B'}
              </button>
            </div>
            <span className="member-stats">
              {memberFilter ? `${filteredCount}/` : ''}{totalCount}
            </span>
          </div>

          <div className="members-list">
            {groupBy === 'none' ? (
              processedMembers.map(m => (
                <MemberItem
                  key={m.id}
                  member={m}
                  isActive={selectedMember?.id === m.id}
                  isSelected={selectedMembers.has(m.id)}
                  onClick={(e) => handleMemberClick(m, e)}
                />
              ))
            ) : (
              groupedMembers && Array.from(groupedMembers.entries()).map(([group, members]) => (
                <div key={group} className="member-group">
                  <div className="member-group-header">
                    {group} <span className="member-group-count">{members.length}</span>
                  </div>
                  {members.map(m => (
                    <MemberItem
                      key={m.id}
                      member={m}
                      isActive={selectedMember?.id === m.id}
                      isSelected={selectedMembers.has(m.id)}
                      onClick={(e) => handleMemberClick(m, e)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="member-hint">Ctrl+Click to pin members to graph</div>
        </div>
      )}

      {/* Source code */}
      <div className="source-section">
        <div className="source-header">
          <span className="source-label">Source</span>
          {sourceFile && (
            <span className="source-file-name" title={sourceFile}>
              {sourceFile.split(/[\\/]/).pop()}
            </span>
          )}
          {sourceLine > 0 && <span className="source-line-info">:{sourceLine}</span>}
        </div>
        <SourceCodeView code={sourceCode} highlightLine={sourceLine} filePath={sourceFile} ref={sourceRef} />
      </div>
    </div>
  )
}

// ---- helpers ----

function kindGroupLabel(kind: SymbolKind): string {
  switch (kind) {
    case SymbolKind.MemberFunction:
    case SymbolKind.Function:
      return 'Methods'
    case SymbolKind.Member:
    case SymbolKind.Variable:
      return 'Fields'
    case SymbolKind.Enum:
    case SymbolKind.Enumerator:
      return 'Enums'
    case SymbolKind.Typedef:
      return 'Typedefs'
    default:
      return 'Other'
  }
}

// ---- Source Code Viewer with syntax highlighting ----

interface ParsedLine {
  num: number
  text: string
}

const SourceCodeView = forwardRef<HTMLPreElement, { code: string; highlightLine: number; filePath: string | null }>(
  ({ code, highlightLine, filePath }, ref) => {
    if (!code) {
      return (
        <pre className="source-code" ref={ref}>
          <code>// No source available</code>
        </pre>
      )
    }

    // Parse line numbers and extract raw text
    const parsed: ParsedLine[] = code.split(/\r?\n/).map(raw => {
      const match = raw.match(/^(\d+): (.*)$/)
      return match
        ? { num: parseInt(match[1], 10), text: match[2] }
        : { num: 0, text: raw }
    })

    // Tokenize with Shiki (memoized by raw code content + filePath)
    const tokens = useMemo(() => {
      const lang = detectLang(filePath)
      if (!lang) return null
      const rawCode = parsed.map(l => l.text).join('\n')
      try {
        return highlightCode(rawCode, lang)
      } catch {
        return null // fallback to plain text on error
      }
    }, [code, filePath])

    return (
      <pre className="source-code" ref={ref}>
        <code>
          {parsed.map((line, i) => (
            <div
              key={i}
              className={`source-line ${line.num === highlightLine ? 'highlighted' : ''}`}
              data-line={line.num}
            >
              <span className="line-number">{line.num || ''}</span>
              <span className="line-content">
                {tokens && tokens[i]
                  ? tokens[i].map((tok, j) => (
                      <span key={j} style={tokenStyle(tok)}>{tok.content}</span>
                    ))
                  : line.text
                }
              </span>
            </div>
          ))}
        </code>
      </pre>
    )
  }
)
SourceCodeView.displayName = 'SourceCodeView'

/** Convert Shiki token to inline style */
function tokenStyle(tok: HighlightToken): React.CSSProperties | undefined {
  const style: React.CSSProperties = {}
  if (tok.color) style.color = tok.color
  if (tok.fontStyle & 1) style.fontStyle = 'italic'
  if (tok.fontStyle & 2) style.fontWeight = 'bold'
  if (tok.fontStyle & 4) style.textDecoration = 'underline'
  return Object.keys(style).length ? style : undefined
}

// ---- Member Item ----

const kindLabels: Record<string, string> = {
  [SymbolKind.MemberFunction]: 'fn',
  [SymbolKind.Function]: 'fn',
  [SymbolKind.Member]: 'var',
  [SymbolKind.Enum]: 'enum',
  [SymbolKind.Typedef]: 'type',
  [SymbolKind.Variable]: 'var',
  [SymbolKind.Enumerator]: 'val',
}

function MemberItem({
  member,
  isActive,
  isSelected,
  onClick,
}: {
  member: CodeSymbol
  isActive: boolean
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`member-item ${isActive ? 'active' : ''} ${isSelected ? 'pinned' : ''} ${member.inheritedFrom ? 'inherited' : ''}`}
      onClick={onClick}
      title={member.inheritedFrom ? `Inherited from ${member.inheritedFrom}` : undefined}
    >
      <span className={`member-kind kind-${member.kind}`}>
        {kindLabels[member.kind] ?? '?'}
      </span>
      <span className="member-name">
        {member.name}
        {member.inheritedFrom && <span className="inherited-tag">{member.inheritedFrom}</span>}
      </span>
      {member.location && (
        <span className="member-line">:{member.location.line}</span>
      )}
      {member.returnType && (
        <span className="member-type">{member.returnType}</span>
      )}
      {isSelected && <span className="pin-indicator">*</span>}
    </div>
  )
}
