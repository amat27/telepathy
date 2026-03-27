// ============================================================
// Symbol Tree (Left Panel) - Class/Struct list with filter
// Virtual scrolling via @tanstack/react-virtual
// ============================================================

import { useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '../../stores/appStore'
import { SymbolKind } from '../../types/model'
import type { SymbolSummary } from '../../types/model'
import * as api from '../../api'
import './SymbolTree.css'

const ITEM_HEIGHT = 28 // px per tree item (matches CSS: padding 4px + content ~20px)

export function SymbolTree({ onCollapse }: { onCollapse?: () => void } = {}) {
  const {
    classes,
    classFilter,
    isLoadingClasses,
    selectedClass,
    isConnected,
    setClassFilter,
    selectClass,
    createTab,
    openDatabase,
  } = useAppStore()

  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: classes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 20,
  })

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
        <span className="tree-count">{classes.length.toLocaleString()}</span>
        {onCollapse && (
          <button
            className="panel-collapse-btn"
            onClick={onCollapse}
            title="Collapse panel"
          >&#x276E;</button>
        )}
      </div>

      <div className="tree-list" ref={scrollRef}>
        {isLoadingClasses ? (
          <div className="tree-loading">Loading...</div>
        ) : classes.length === 0 ? (
          <div className="tree-loading">No classes found</div>
        ) : (
          <div
            className="tree-list-inner"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map(vItem => {
              const cls = classes[vItem.index]
              return (
                <SymbolTreeItem
                  key={cls.id}
                  symbol={cls}
                  isSelected={selectedClass?.id === cls.id}
                  style={{
                    height: vItem.size,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      createTab(cls.id)
                    } else {
                      selectClass(cls.id)
                    }
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SymbolTreeItem({
  symbol,
  isSelected,
  style,
  onClick,
}: {
  symbol: SymbolSummary
  isSelected: boolean
  style: React.CSSProperties
  onClick: (e: React.MouseEvent) => void
}) {
  const kindChar = symbol.kind === SymbolKind.Class ? 'C' : 'S'
  const kindClass = symbol.kind === SymbolKind.Class ? 'kind-class' : 'kind-struct'

  return (
    <div
      className={`tree-item ${isSelected ? 'selected' : ''}`}
      style={style}
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
