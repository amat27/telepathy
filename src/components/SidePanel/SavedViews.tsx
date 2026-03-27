// ============================================================
// Saved Views — tree panel with two fixed roots:
//   Class View / Call Stack
// Supports: inline rename, folders, double-click open, context menu
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import type { SavedViewNode, SavedViewCategory } from '../../types/model'

export function SavedViews() {
  const savedViews = useAppStore(s => s.savedViews)
  const openSavedView = useAppStore(s => s.openSavedView)
  const renameSavedView = useAppStore(s => s.renameSavedView)
  const deleteSavedView = useAppStore(s => s.deleteSavedView)
  const createSavedViewFolder = useAppStore(s => s.createSavedViewFolder)

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string; category: SavedViewCategory; isFolder: boolean
  } | null>(null)

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string, category: SavedViewCategory, isFolder: boolean) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId, category, isFolder })
    }, [],
  )

  const handleRootContextMenu = useCallback(
    (e: React.MouseEvent, category: SavedViewCategory) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: '__root__', category, isFolder: true })
    }, [],
  )

  return (
    <div className="saved-views">
      {/* Class View root */}
      <RootNode
        label="Class View"
        category="class-view"
        nodes={savedViews.classView}
        collapsed={collapsed}
        renamingId={renamingId}
        onToggleCollapse={toggleCollapse}
        onDoubleClick={openSavedView}
        onContextMenu={handleContextMenu}
        onRootContextMenu={handleRootContextMenu}
        onRenameCommit={(id, name) => { renameSavedView(id, name); setRenamingId(null) }}
        onRenameCancel={() => setRenamingId(null)}
      />

      {/* Callstack root */}
      <RootNode
        label="Call Stack"
        category="callstack"
        nodes={savedViews.callstack}
        collapsed={collapsed}
        renamingId={renamingId}
        onToggleCollapse={toggleCollapse}
        onDoubleClick={openSavedView}
        onContextMenu={handleContextMenu}
        onRootContextMenu={handleRootContextMenu}
        onRenameCommit={(id, name) => { renameSavedView(id, name); setRenamingId(null) }}
        onRenameCancel={() => setRenamingId(null)}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          className="sv-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.nodeId === '__root__' ? (
            <button onClick={() => {
              createSavedViewFolder(contextMenu.category)
              setContextMenu(null)
            }}>
              New Folder
            </button>
          ) : (
            <>
              <button onClick={() => {
                setRenamingId(contextMenu.nodeId)
                setContextMenu(null)
              }}>
                Rename
              </button>
              {contextMenu.isFolder && (
                <button onClick={() => {
                  createSavedViewFolder(contextMenu.category, contextMenu.nodeId)
                  setContextMenu(null)
                }}>
                  New Subfolder
                </button>
              )}
              <button className="sv-ctx-danger" onClick={() => {
                deleteSavedView(contextMenu.nodeId)
                setContextMenu(null)
              }}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Root node (Class View / Call Stack) ----

interface RootNodeProps {
  label: string
  category: SavedViewCategory
  nodes: SavedViewNode[]
  collapsed: Set<string>
  renamingId: string | null
  onToggleCollapse: (id: string) => void
  onDoubleClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string, cat: SavedViewCategory, isFolder: boolean) => void
  onRootContextMenu: (e: React.MouseEvent, cat: SavedViewCategory) => void
  onRenameCommit: (id: string, name: string) => void
  onRenameCancel: () => void
}

function RootNode({
  label, category, nodes, collapsed, renamingId,
  onToggleCollapse, onDoubleClick, onContextMenu, onRootContextMenu,
  onRenameCommit, onRenameCancel,
}: RootNodeProps) {
  const [rootCollapsed, setRootCollapsed] = useState(false)

  return (
    <div className="sv-root">
      <div
        className="sv-root-header"
        onClick={() => setRootCollapsed(!rootCollapsed)}
        onContextMenu={(e) => onRootContextMenu(e, category)}
      >
        <span className="sv-chevron">{rootCollapsed ? '\u25B8' : '\u25BE'}</span>
        <span className="sv-root-label">{label}</span>
        <span className="sv-count">{countViews(nodes)}</span>
      </div>
      {!rootCollapsed && (
        <div className="sv-children">
          {nodes.length === 0 && (
            <div className="sv-empty">No saved views</div>
          )}
          {nodes.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={1}
              category={category}
              collapsed={collapsed}
              renamingId={renamingId}
              onToggleCollapse={onToggleCollapse}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Recursive tree node ----

interface TreeNodeProps {
  node: SavedViewNode
  depth: number
  category: SavedViewCategory
  collapsed: Set<string>
  renamingId: string | null
  onToggleCollapse: (id: string) => void
  onDoubleClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string, cat: SavedViewCategory, isFolder: boolean) => void
  onRenameCommit: (id: string, name: string) => void
  onRenameCancel: () => void
}

function TreeNode({
  node, depth, category, collapsed, renamingId,
  onToggleCollapse, onDoubleClick, onContextMenu,
  onRenameCommit, onRenameCancel,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder'
  const isCollapsed = collapsed.has(node.id)
  const isRenaming = renamingId === node.id

  return (
    <div className="sv-node-group">
      <div
        className={`sv-node ${isFolder ? 'sv-folder' : 'sv-view'}`}
        style={{ paddingLeft: depth * 16 }}
        onDoubleClick={() => {
          if (isFolder) onToggleCollapse(node.id)
          else onDoubleClick(node.id)
        }}
        onContextMenu={(e) => onContextMenu(e, node.id, category, isFolder)}
      >
        {isFolder && (
          <span
            className="sv-chevron"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id) }}
          >
            {isCollapsed ? '\u25B8' : '\u25BE'}
          </span>
        )}
        <span className={`sv-icon ${isFolder ? 'sv-icon-folder' : `sv-icon-${node.viewType ?? category}`}`}>
          {isFolder ? '\uD83D\uDCC1' : (node.viewType === 'callstack' || category === 'callstack') ? '\u260B' : '\u25C6'}
        </span>
        {isRenaming ? (
          <InlineRenameInput
            initialValue={node.name}
            onCommit={(val) => onRenameCommit(node.id, val)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="sv-node-label" title={node.name}>{node.name}</span>
        )}
      </div>
      {isFolder && !isCollapsed && node.children && (
        <div className="sv-children">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              category={category}
              collapsed={collapsed}
              renamingId={renamingId}
              onToggleCollapse={onToggleCollapse}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Inline rename input ----

function InlineRenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string
  onCommit: (val: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [])

  return (
    <input
      ref={ref}
      className="sv-rename-input"
      defaultValue={initialValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const val = (e.target as HTMLInputElement).value.trim()
          if (val) onCommit(val)
          else onCancel()
        } else if (e.key === 'Escape') {
          onCancel()
        }
      }}
      onBlur={(e) => {
        const val = e.target.value.trim()
        if (val && val !== initialValue) onCommit(val)
        else onCancel()
      }}
    />
  )
}

// ---- Helpers ----

function countViews(nodes: SavedViewNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.type === 'view') count++
    if (n.children) count += countViews(n.children)
  }
  return count
}
