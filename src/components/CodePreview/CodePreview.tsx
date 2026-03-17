// ============================================================
// Code Preview (Right Panel) - Member list + source code
// ============================================================

import { useRef, useEffect, useCallback, useState, useMemo, forwardRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { CodeSymbol } from '../../types/model'
import './CodePreview.css'

type SortKey = 'name' | 'kind' | 'line'
type GroupMode = 'none' | 'kind'

export function CodePreview() {
  const { selectedClass, selectedMember, selectedMembers, sourceCode, sourceFile, sourceLine, selectMember, toggleMember } = useAppStore()
  const sourceRef = useRef<HTMLPreElement>(null)

  // Local UI state for member list controls
  const [memberFilter, setMemberFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('line')
  const [groupBy, setGroupBy] = useState<GroupMode>('none')

  // Reset filter when class changes
  useEffect(() => {
    setMemberFilter('')
  }, [selectedClass?.id])

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
    if (!selectedClass?.members) return []
    let list = selectedClass.members

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
  }, [selectedClass?.members, memberFilter, sortBy])

  // Group members by kind
  const groupedMembers = useMemo(() => {
    if (groupBy === 'none') return null

    const groups = new Map<string, CodeSymbol[]>()
    for (const m of processedMembers) {
      const key = kindGroupLabel(m.kind)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return groups
  }, [processedMembers, groupBy])

  if (!selectedClass) {
    return (
      <div className="code-preview-empty">
        <p>Select a class to view details</p>
      </div>
    )
  }

  const totalCount = selectedClass.members?.length ?? 0
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
        <span className="code-title">{selectedClass.name}</span>
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
                onClick={() => setGroupBy(g => g === 'none' ? 'kind' : 'none')}
                title="Group by kind"
              >
                G
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
          Source
          {sourceLine > 0 && <span className="source-line-info">Line {sourceLine}</span>}
        </div>
        <SourceCodeView code={sourceCode} highlightLine={sourceLine} ref={sourceRef} />
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

// ---- Source Code Viewer with line highlighting ----

const SourceCodeView = forwardRef<HTMLPreElement, { code: string; highlightLine: number }>(
  ({ code, highlightLine }, ref) => {
    if (!code) {
      return (
        <pre className="source-code" ref={ref}>
          <code>// No source available</code>
        </pre>
      )
    }

    const lines = code.split('\n').map(raw => {
      const match = raw.match(/^(\d+): (.*)$/)
      if (match) {
        return { num: parseInt(match[1], 10), text: match[2] }
      }
      return { num: 0, text: raw }
    })

    return (
      <pre className="source-code" ref={ref}>
        <code>
          {lines.map((line, i) => (
            <div
              key={i}
              className={`source-line ${line.num === highlightLine ? 'highlighted' : ''}`}
              data-line={line.num}
            >
              <span className="line-number">{line.num || ''}</span>
              <span className="line-content">{line.text}</span>
            </div>
          ))}
        </code>
      </pre>
    )
  }
)
SourceCodeView.displayName = 'SourceCodeView'

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
      className={`member-item ${isActive ? 'active' : ''} ${isSelected ? 'pinned' : ''}`}
      onClick={onClick}
    >
      <span className={`member-kind kind-${member.kind}`}>
        {kindLabels[member.kind] ?? '?'}
      </span>
      <span className="member-name">{member.name}</span>
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
