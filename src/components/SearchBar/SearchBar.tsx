// ============================================================
// Search Bar Component
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { SymbolSummary } from '../../types/model'
import { Search } from '../icons'
import './SearchBar.css'

const kindIcon: Record<string, string> = {
  [SymbolKind.Class]: 'C',
  [SymbolKind.Struct]: 'S',
  [SymbolKind.MemberFunction]: 'M',
  [SymbolKind.Function]: 'F',
  [SymbolKind.Member]: 'm',
  [SymbolKind.Enum]: 'E',
  [SymbolKind.Namespace]: 'N',
  [SymbolKind.Typedef]: 'T',
}

export function SearchBar() {
  const { search, searchResults, isSearching, selectClass, createTab, isConnected } = useAppStore()
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search(value)
      setShowResults(true)
    }, 200)
  }, [search])

  const handleSelect = useCallback((symbol: SymbolSummary, e: React.MouseEvent) => {
    if (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Struct) {
      if (e.ctrlKey || e.metaKey) {
        createTab(symbol.id)
      } else {
        selectClass(symbol.id)
      }
    }
    setShowResults(false)
  }, [selectClass, createTab])

  // Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') {
        setShowResults(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="search-bar">
      <div className="search-input-wrap">
        <Search size={14} strokeWidth={1.75} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder={isConnected ? 'Search symbols... (Ctrl+K)' : 'Open a database first...'}
          value={query}
          onChange={handleChange}
          onFocus={() => query && setShowResults(true)}
          disabled={!isConnected}
        />
        {isSearching && <span className="search-spinner" />}
      </div>

      {showResults && searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map(sym => (
            <div
              key={sym.id}
              className="search-result-item"
              onClick={(e) => handleSelect(sym, e)}
            >
              <span className={`kind-badge kind-${sym.kind}`}>
                {kindIcon[sym.kind] ?? '?'}
              </span>
              <span className="result-name">{sym.name}</span>
              <span className="result-file">
                {sym.file.split(/[\\/]/).pop()}:{sym.line}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
