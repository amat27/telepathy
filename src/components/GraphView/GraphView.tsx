// ============================================================
// Graph View - Sourcetrail-style class hierarchy + member list
// ============================================================

import { useMemo, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  MarkerType,
  Handle,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAppStore } from '../../stores/appStore'
import { EdgeKind, SymbolKind } from '../../types/model'
import type { CodeGraph, CodeSymbol, PinnedMember, SymbolEdge } from '../../types/model'
import { findIslands, estimateNodeDimensions, layoutIslands, type NodeInfo } from '../../utils/graphLayout'
import './GraphView.css'

// ---- Compact Class Node (base/derived) ----

export interface ClassNodeData {
  label: string
  kind: SymbolKind
  memberCount?: number
  isRoot: boolean
  classId?: string           // resolved class id for click handling (callstack nodes)
  isPinned?: boolean         // whether this class is pinned
  [key: string]: unknown
}

function ClassNode({ data }: NodeProps<Node<ClassNodeData>>) {
  const kindClass = data.kind === SymbolKind.Struct ? 'struct' : 'class'
  const unresolvedClass = data.classId ? '' : 'unresolved'
  const pinnedClass = data.isPinned ? 'pinned' : ''
  const store = useAppStore

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!data.classId) return
    store.getState().togglePinClass(data.classId)
  }, [data.classId])

  return (
    <div className={`class-node ${kindClass} ${unresolvedClass} ${pinnedClass}`}>
      <Handle type="target" position={Position.Top} />
      <div className="class-node-header">
        <span className={`node-kind-badge ${kindClass}`}>
          {data.kind === SymbolKind.Struct ? 'S' : 'C'}
        </span>
        <span className="node-label">{data.label}</span>
        {!data.classId && <span className="unresolved-badge" title="Not found in database">?</span>}
        {data.classId && (
          <button
            className={`pin-btn ${data.isPinned ? 'active' : ''}`}
            onClick={handlePinClick}
            title={data.isPinned ? 'Unpin class' : 'Pin class (Shift+Click node)'}
          >
            {data.isPinned ? '\u{1F4CC}' : '\u{1F4CC}'}
          </button>
        )}
      </div>
      {data.memberCount !== undefined && data.memberCount > 0 && (
        <div className="class-node-footer">
          {data.memberCount} members
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

// ---- Expanded Class Node (selected, shows pinned members) ----

export interface ExpandedNodeData {
  label: string
  kind: SymbolKind
  members: CodeSymbol[]
  totalMemberCount: number
  selectedMemberId: string | null
  isRoot: true
  classId: string
  isPinned: boolean
  pinnedMemberIds: Set<string>
  [key: string]: unknown
}

const kindLabels: Record<string, string> = {
  [SymbolKind.MemberFunction]: 'fn',
  [SymbolKind.Function]: 'fn',
  [SymbolKind.Member]: 'var',
  [SymbolKind.Enum]: 'enum',
  [SymbolKind.Typedef]: 'type',
  [SymbolKind.Variable]: 'var',
  [SymbolKind.Enumerator]: 'val',
}

function ExpandedClassNode({ data }: NodeProps<Node<ExpandedNodeData>>) {
  const kindClass = data.kind === SymbolKind.Struct ? 'struct' : 'class'
  const store = useAppStore

  const handleMemberClick = useCallback((member: CodeSymbol) => {
    const state = store.getState()
    if (member.location) {
      state.selectMember(member)
    }
  }, [])

  const handlePinClass = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    store.getState().togglePinClass(data.classId)
  }, [data.classId])

  const handlePinMember = useCallback((e: React.MouseEvent, member: CodeSymbol) => {
    e.stopPropagation()
    store.getState().togglePinMember(member, data.classId)
  }, [data.classId])

  const members = data.members
  const hasPinned = members.length < data.totalMemberCount

  // Split into functions and fields
  const functions = members.filter(
    m => m.kind === SymbolKind.MemberFunction || m.kind === SymbolKind.Function
  )
  const fields = members.filter(
    m => m.kind !== SymbolKind.MemberFunction && m.kind !== SymbolKind.Function
  )

  const renderMemberRow = (m: CodeSymbol) => {
    const isMemberPinned = data.pinnedMemberIds.has(m.id)
    return (
      <div
        key={m.id}
        className={`graph-member-row ${data.selectedMemberId === m.id ? 'active' : ''} ${m.inheritedFrom ? 'inherited' : ''} ${isMemberPinned ? 'member-pinned' : ''}`}
        onClick={(e) => { e.stopPropagation(); handleMemberClick(m) }}
      >
        <span className={`gm-kind kind-${m.kind}`}>
          {kindLabels[m.kind] ?? '?'}
        </span>
        <span className="gm-name" title={m.inheritedFrom ? `${m.name} (from ${m.inheritedFrom})` : m.signature ?? m.name}>{m.name}</span>
        {m.returnType && <span className="gm-type">{m.returnType}</span>}
        <button
          className={`pin-btn small ${isMemberPinned ? 'active' : ''}`}
          onClick={(e) => handlePinMember(e, m)}
          title={isMemberPinned ? 'Unpin member' : 'Pin member'}
        >
          {'\u{1F4CC}'}
        </button>
      </div>
    )
  }

  return (
    <div className={`expanded-class-node ${kindClass} ${data.isPinned ? 'pinned' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="expanded-header">
        <span className={`node-kind-badge ${kindClass}`}>
          {data.kind === SymbolKind.Struct ? 'S' : 'C'}
        </span>
        <span className="node-label">{data.label}</span>
        <span className="member-count-badge">
          {hasPinned ? `${members.length}/${data.totalMemberCount}` : data.totalMemberCount}
        </span>
        <button
          className={`pin-btn ${data.isPinned ? 'active' : ''}`}
          onClick={handlePinClass}
          title={data.isPinned ? 'Unpin class' : 'Pin class'}
        >
          {'\u{1F4CC}'}
        </button>
      </div>

      {members.length === 0 && (
        <div className="expanded-empty">
          {data.totalMemberCount} members (none pinned)
        </div>
      )}

      {fields.length > 0 && (
        <div className="expanded-section">
          <div className="section-label">Fields</div>
          {fields.map(renderMemberRow)}
        </div>
      )}

      {functions.length > 0 && (
        <div className="expanded-section">
          <div className="section-label">Methods</div>
          {functions.map(renderMemberRow)}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = {
  classNode: ClassNode,
  expandedClassNode: ExpandedClassNode,
}

// ---- Layout helpers ----

export function buildFlowElements(
  graph: CodeGraph | null,
  selectedClassId: string | null,
  selectedMemberId: string | null,
  pinnedMemberIds: Set<string>,
  pinnedClasses: Map<string, CodeSymbol>,
  pinnedMembers: Map<string, PinnedMember>,
): { nodes: Node[]; edges: Edge[] } {
  const hasGraph = graph && graph.nodes.length > 0

  if (!hasGraph && pinnedClasses.size === 0) {
    return { nodes: [], edges: [] }
  }

  // ---- Callstack mode: graph present but no selected class ----
  if (!selectedClassId && hasGraph) {
    const VERTICAL_GAP = 140
    const flowNodes: Node[] = graph.nodes.map((n, i) => ({
      id: n.id,
      type: 'classNode',
      position: { x: 0, y: i * VERTICAL_GAP },
      data: {
        label: n.name,
        kind: n.kind,
        memberCount: undefined,
        isRoot: false,
        classId: n.typeClassId ?? undefined,    // resolved class id from callstack frame
      },
    }))
    const flowEdges: Edge[] = graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: {
        stroke: 'var(--color-call-edge)',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--color-call-edge)',
      },
      label: e.label ?? e.kind,
      labelStyle: { fill: 'var(--text-muted)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--bg-surface)', fillOpacity: 0.8 },
      labelBgPadding: [6, 4] as [number, number],
    }))
    return { nodes: flowNodes, edges: flowEdges }
  }

  // ---- Hierarchy mode (dagre-based layout) ----

  const graphEdges = hasGraph ? graph.edges : []
  const graphNodes = hasGraph ? graph.nodes : []

  // Analyze graph relationships
  const baseIds = new Set<string>()
  const derivedIds = new Set<string>()
  const typeIds = new Set<string>()

  for (const edge of graphEdges) {
    if (edge.kind === EdgeKind.Inherits) {
      if (edge.source === selectedClassId) {
        baseIds.add(edge.target)
      } else if (edge.target === selectedClassId) {
        derivedIds.add(edge.source)
      }
    } else if (edge.kind === EdgeKind.UsesType) {
      typeIds.add(edge.target)
    }
  }

  // ---- Phase 1: Collect node descriptors (id, type, data, dimensions) ----

  interface NodeDescriptor {
    id: string
    type: 'classNode' | 'expandedClassNode'
    data: ClassNodeData | ExpandedNodeData
    width: number
    height: number
  }

  const descriptors = new Map<string, NodeDescriptor>()

  // Helper: add a compact class node (skip if already present)
  const addCompactNode = (n: CodeSymbol, classId: string) => {
    if (descriptors.has(classId)) return
    const { width, height } = estimateNodeDimensions(false)
    descriptors.set(classId, {
      id: classId,
      type: 'classNode',
      data: {
        label: n.name,
        kind: n.kind,
        memberCount: n.members?.length,
        isRoot: false,
        classId,
        isPinned: pinnedClasses.has(classId),
      },
      width,
      height,
    })
  }

  // (a) Base classes
  for (const n of graphNodes) {
    if (baseIds.has(n.id)) addCompactNode(n, n.id)
  }

  // (b) Selected class — expanded with members
  const selected = graphNodes.find(n => n.id === selectedClassId)
  if (selected) {
    const allMembers = selected.members ?? []
    // Show pinned members + currently selected member in graph
    const visibleIds = new Set(pinnedMemberIds)
    if (selectedMemberId) visibleIds.add(selectedMemberId)
    for (const [, pm] of pinnedMembers) {
      if (pm.classId === selected.id) visibleIds.add(pm.member.id)
    }
    const displayMembers = visibleIds.size > 0
      ? allMembers.filter(m => visibleIds.has(m.id))
      : []

    // Count sections for height estimation
    const functions = displayMembers.filter(
      m => m.kind === SymbolKind.MemberFunction || m.kind === SymbolKind.Function
    )
    const fields = displayMembers.filter(
      m => m.kind !== SymbolKind.MemberFunction && m.kind !== SymbolKind.Function
    )
    const sectionCount = (functions.length > 0 ? 1 : 0) + (fields.length > 0 ? 1 : 0)
    const { width, height } = estimateNodeDimensions(true, displayMembers.length, sectionCount)

    descriptors.set(selected.id, {
      id: selected.id,
      type: 'expandedClassNode',
      data: {
        label: selected.name,
        kind: selected.kind,
        members: displayMembers,
        totalMemberCount: allMembers.length,
        selectedMemberId,
        isRoot: true,
        classId: selected.id,
        isPinned: pinnedClasses.has(selected.id),
        pinnedMemberIds: new Set([...pinnedMemberIds, ...[...pinnedMembers.values()].filter(pm => pm.classId === selected.id).map(pm => pm.member.id)]),
      },
      width,
      height,
    })

    // Determine active type IDs (referenced by visible members)
    const activeTypeIds = new Set<string>()
    for (const m of displayMembers) {
      if (m.typeClassId && typeIds.has(m.typeClassId)
        && !baseIds.has(m.typeClassId) && !derivedIds.has(m.typeClassId)
        && m.typeClassId !== selectedClassId) {
        activeTypeIds.add(m.typeClassId)
      }
    }

    // (c) Type-reference nodes
    for (const n of graphNodes) {
      if (activeTypeIds.has(n.id)) addCompactNode(n, n.id)
    }
  }

  // (d) Derived classes
  for (const n of graphNodes) {
    if (derivedIds.has(n.id)) addCompactNode(n, n.id)
  }

  // (e) Pinned classes not already in graph
  for (const [classId, classDetail] of pinnedClasses) {
    if (descriptors.has(classId)) continue

    const classPinnedMembers = [...pinnedMembers.values()]
      .filter(pm => pm.classId === classId)
      .map(pm => pm.member)

    if (classPinnedMembers.length > 0) {
      const fns = classPinnedMembers.filter(
        m => m.kind === SymbolKind.MemberFunction || m.kind === SymbolKind.Function
      )
      const flds = classPinnedMembers.filter(
        m => m.kind !== SymbolKind.MemberFunction && m.kind !== SymbolKind.Function
      )
      const sc = (fns.length > 0 ? 1 : 0) + (flds.length > 0 ? 1 : 0)
      const { width, height } = estimateNodeDimensions(true, classPinnedMembers.length, sc)

      descriptors.set(classId, {
        id: classId,
        type: 'expandedClassNode',
        data: {
          label: classDetail.name,
          kind: classDetail.kind,
          members: classPinnedMembers,
          totalMemberCount: classDetail.members?.length ?? classPinnedMembers.length,
          selectedMemberId: null,
          isRoot: true,
          classId,
          isPinned: true,
          pinnedMemberIds: new Set(classPinnedMembers.map(m => m.id)),
        },
        width,
        height,
      })
    } else {
      const { width, height } = estimateNodeDimensions(false)
      descriptors.set(classId, {
        id: classId,
        type: 'classNode',
        data: {
          label: classDetail.name,
          kind: classDetail.kind,
          memberCount: classDetail.members?.length,
          isRoot: false,
          classId,
          isPinned: true,
        },
        width,
        height,
      })
    }
  }

  // ---- Phase 2: Collect layout edges (only between active nodes) ----

  const activeNodeIds = new Set(descriptors.keys())
  const layoutEdges: SymbolEdge[] = []

  for (const e of graphEdges) {
    if (activeNodeIds.has(e.source) && activeNodeIds.has(e.target)) {
      layoutEdges.push(e)
    }
  }

  // Add synthetic pin-type edges for dagre connectivity
  for (const [, pm] of pinnedMembers) {
    if (pm.member.typeClassId && activeNodeIds.has(pm.member.typeClassId) && activeNodeIds.has(pm.classId)) {
      const edgeId = `pin-type-${pm.member.id}`
      if (!layoutEdges.some(e => e.id === edgeId)) {
        layoutEdges.push({
          id: edgeId,
          source: pm.classId,
          target: pm.member.typeClassId,
          kind: EdgeKind.UsesType,
          label: pm.member.name,
        })
      }
    }
  }

  // ---- Phase 3: Dagre layout via island detection ----

  const nodeIds = [...descriptors.keys()]
  const islands = findIslands(nodeIds, layoutEdges)

  const nodeInfoMap = new Map<string, NodeInfo>()
  for (const [id, desc] of descriptors) {
    nodeInfoMap.set(id, { width: desc.width, height: desc.height, data: {} })
  }

  const { positions } = layoutIslands(islands, nodeInfoMap, selectedClassId)

  // ---- Phase 4: Build ReactFlow nodes with dagre positions ----

  const flowNodes: Node[] = [...descriptors.values()].map(desc => ({
    id: desc.id,
    type: desc.type,
    position: positions.get(desc.id) ?? { x: 0, y: 0 },
    data: desc.data,
  }))

  // ---- Phase 5: Build ReactFlow edges ----

  const flowEdges: Edge[] = []

  // Original graph edges (filter to active nodes)
  for (const e of graphEdges) {
    if (!activeNodeIds.has(e.source) || !activeNodeIds.has(e.target)) continue
    const isUsesType = e.kind === EdgeKind.UsesType
    flowEdges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: isUsesType,
      style: {
        stroke: isUsesType
          ? 'var(--color-type-edge)'
          : e.kind === EdgeKind.Inherits
            ? 'var(--color-inherit-edge)'
            : 'var(--color-call-edge)',
        strokeWidth: isUsesType ? 1.5 : 2,
        strokeDasharray: isUsesType ? '6 3' : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isUsesType
          ? 'var(--color-type-edge)'
          : e.kind === EdgeKind.Inherits
            ? 'var(--color-inherit-edge)'
            : 'var(--color-call-edge)',
      },
      label: e.label ?? (isUsesType ? 'type' : e.kind === EdgeKind.Inherits ? 'inherits' : e.kind),
      labelStyle: { fill: 'var(--text-muted)', fontSize: 10 },
    })
  }

  // Pinned member → type class edges (typeClassId relationship)
  for (const [, pm] of pinnedMembers) {
    if (pm.member.typeClassId && activeNodeIds.has(pm.member.typeClassId) && activeNodeIds.has(pm.classId)) {
      const edgeId = `pin-type-${pm.member.id}`
      // Avoid duplicates
      if (!flowEdges.some(e => e.id === edgeId)) {
        flowEdges.push({
          id: edgeId,
          source: pm.classId,
          target: pm.member.typeClassId,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: 'var(--color-type-edge)',
            strokeWidth: 1.5,
            strokeDasharray: '6 3',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--color-type-edge)',
          },
          label: pm.member.name,
          labelStyle: { fill: 'var(--text-muted)', fontSize: 10 },
        })
      }
    }
  }

  return { nodes: flowNodes, edges: flowEdges }
}

// ---- Main Component ----

export function GraphView() {
  const {
    graph, selectedClass, selectedMember, selectedMembers, isLoadingGraph,
    selectClass, previewClass, createTab, togglePinClass,
    pinnedClasses, pinnedMembers,
  } = useAppStore()

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(graph, selectedClass?.id ?? null, selectedMember?.id ?? null, selectedMembers, pinnedClasses, pinnedMembers),
    [graph, selectedClass, selectedMember, selectedMembers, pinnedClasses, pinnedMembers]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when graph changes
  useMemo(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Single/double click disambiguation timer
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const data = node.data as ClassNodeData
      const classId = data.classId
      if (!classId) return  // unresolved node — no action

      if (event.shiftKey) {
        // Shift+Click: toggle pin
        togglePinClass(classId)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        // Ctrl+Click: open in new tab
        createTab(classId)
        return
      }

      // Start single-click timer (will be cancelled if double-click fires)
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        // Single click: preview only (update right panel, keep graph)
        if (classId !== selectedClass?.id) {
          previewClass(classId)
        }
      }, 250)
    },
    [selectedClass, previewClass, createTab, togglePinClass]
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as ClassNodeData
      const classId = data.classId
      if (!classId) return

      // Cancel pending single-click
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }

      // Double click: full navigation
      if (classId !== selectedClass?.id) {
        selectClass(classId)
      }
    },
    [selectedClass, selectClass]
  )

  if (isLoadingGraph) {
    return <div className="graph-placeholder">Loading graph...</div>
  }

  const hasPinned = pinnedClasses.size > 0
  if (!hasPinned && (!graph || graph.nodes.length === 0)) {
    return (
      <div className="graph-placeholder">
        <p>Select a class to view its hierarchy</p>
      </div>
    )
  }

  return (
    <div className="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border-color)" gap={20} />
        <Controls
          showInteractive={false}
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
        />
        <MiniMap
          nodeColor={(n) => {
            return n.type === 'expandedClassNode' ? 'var(--text-accent)' : 'var(--color-class)'
          }}
          style={{ background: 'var(--bg-secondary)' }}
        />
      </ReactFlow>
    </div>
  )
}
