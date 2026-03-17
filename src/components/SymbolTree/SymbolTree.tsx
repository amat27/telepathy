// ============================================================
// Symbol Tree (Left Panel) - Class/Struct list with filter
// ============================================================

import { useCallback, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { SymbolSummary } from '../../types/model'
import * as api from '../../api'
import './SymbolTree.css'

export function SymbolTree() {
  const {
    classes,
    classFilter,
    isLoadingClasses,
    selectedClass,
    isConnected,
    setClassFilter,
    selectClass,
    openDatabase,
  } = useAppStore()

  const handleOpenDb = useCallback(async () => {
    const dbPath = await api.openDbDialog()
    if (dbPath) {
      await openDatabase(dbPath)
    }
  }, [openDatabase])

  if (!isConnected) {
    return (
      <div className="symbol-tree-empty">
        <div className="empty-icon">&#128218;</div>
        <p>No database loaded</p>
        <button className="open-db-btn" onClick={handleOpenDb}>
          Open Browse.VC.db
        </button>
      </div>
    )
  }

  return (
    <div className="symbol-tree">
      <div className="tree-header">
        <input
          type="text"
          className="tree-filter"
          placeholder="Filter classes..."
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
        />
        <span className="tree-count">{classes.length}</span>
      </div>

      <div className="tree-list">
        {isLoadingClasses ? (
          <div className="tree-loading">Loading...</div>
        ) : classes.length === 0 ? (
          <div className="tree-loading">No classes found</div>
        ) : (
          classes.map(cls => (
            <SymbolTreeItem
              key={cls.id}
              symbol={cls}
              isSelected={selectedClass?.id === cls.id}
              onClick={() => selectClass(cls.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SymbolTreeItem({
  symbol,
  isSelected,
  onClick,
}: {
  symbol: SymbolSummary
  isSelected: boolean
  onClick: () => void
}) {
  const kindChar = symbol.kind === SymbolKind.Class ? 'C' : 'S'
  const kindClass = symbol.kind === SymbolKind.Class ? 'kind-class' : 'kind-struct'

  return (
    <div
      className={`tree-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <span className={`kind-badge ${kindClass}`}>{kindChar}</span>
      <span className="item-name" title={symbol.qualifiedName}>
        {symbol.name}
      </span>
      {symbol.memberCount !== undefined && (
        <span className="item-count">{symbol.memberCount}</span>
      )}
    </div>
  )
}
