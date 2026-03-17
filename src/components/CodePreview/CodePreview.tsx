// ============================================================
// Code Preview (Right Panel) - Source code with member navigation
// ============================================================

import { useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { CodeSymbol } from '../../types/model'
import './CodePreview.css'

export function CodePreview() {
  const { selectedClass, selectedMember, sourceCode, sourceFile, sourceLine, selectMember } = useAppStore()
  const sourceRef = useRef<HTMLPreElement>(null)

  // Scroll to the highlighted line when source changes
  useEffect(() => {
    if (sourceRef.current && sourceLine > 0) {
      const lineEl = sourceRef.current.querySelector(`[data-line="${sourceLine}"]`)
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [sourceCode, sourceLine])

  if (!selectedClass) {
    return (
      <div className="code-preview-empty">
        <p>Select a class to view source code</p>
      </div>
    )
  }

  const handleMemberClick = (member: CodeSymbol) => {
    selectMember(member)
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

      {/* Members list */}
      {selectedClass.members && selectedClass.members.length > 0 && (
        <div className="members-section">
          <div className="members-header">Members ({selectedClass.members.length})</div>
          <div className="members-list">
            {selectedClass.members.map(m => (
              <MemberItem
                key={m.id}
                member={m}
                isActive={selectedMember?.id === m.id}
                onClick={() => handleMemberClick(m)}
              />
            ))}
          </div>
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

// ---- Source Code Viewer with line highlighting ----

import { forwardRef } from 'react'

const SourceCodeView = forwardRef<HTMLPreElement, { code: string; highlightLine: number }>(
  ({ code, highlightLine }, ref) => {
    if (!code) {
      return (
        <pre className="source-code" ref={ref}>
          <code>// No source available</code>
        </pre>
      )
    }

    // Parse "lineNum: content" format from the backend
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

function MemberItem({
  member,
  isActive,
  onClick,
}: {
  member: CodeSymbol
  isActive: boolean
  onClick: () => void
}) {
  const kindLabels: Record<string, string> = {
    [SymbolKind.MemberFunction]: 'fn',
    [SymbolKind.Function]: 'fn',
    [SymbolKind.Member]: 'var',
    [SymbolKind.Enum]: 'enum',
    [SymbolKind.Typedef]: 'type',
  }

  return (
    <div className={`member-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <span className={`member-kind kind-${member.kind}`}>
        {kindLabels[member.kind] ?? member.kind}
      </span>
      <span className="member-name">{member.name}</span>
      {member.location && (
        <span className="member-line">:{member.location.line}</span>
      )}
      {member.returnType && (
        <span className="member-type">{member.returnType}</span>
      )}
    </div>
  )
}
