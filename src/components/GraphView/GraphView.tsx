// ============================================================
// Graph View - Sourcetrail-style class hierarchy + member list
// ============================================================

import { useMemo, useCallback } from 'react'
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
import type { CodeGraph, CodeSymbol } from '../../types/model'
import './GraphView.css'

// ---- Compact Class Node (base/derived) ----

interface ClassNodeData {
  label: string
  kind: SymbolKind
  memberCount?: number
  isRoot: boolean
  [key: string]: unknown
}

function ClassNode({ data }: NodeProps<Node<ClassNodeData>>) {
  const kindClass = data.kind === SymbolKind.Struct ? 'struct' : 'class'
  return (
    <div className={`class-node ${kindClass}`}>
      <Handle type="target" position={Position.Top} />
      <div className="class-node-header">
        <span className={`node-kind-badge ${kindClass}`}>
          {data.kind === SymbolKind.Struct ? 'S' : 'C'}
        </span>
        <span className="node-label">{data.label}</span>
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

interface ExpandedNodeData {
  label: string
  kind: SymbolKind
  members: CodeSymbol[]
  totalMemberCount: number
  selectedMemberId: string | null
  isRoot: true
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

  const members = data.members
  const hasPinned = members.length < data.totalMemberCount

  // Split into functions and fields
  const functions = members.filter(
    m => m.kind === SymbolKind.MemberFunction || m.kind === SymbolKind.Function
  )
  const fields = members.filter(
    m => m.kind !== SymbolKind.MemberFunction && m.kind !== SymbolKind.Function
  )

  return (
    <div className={`expanded-class-node ${kindClass}`}>
      <Handle type="target" position={Position.Top} />
      <div className="expanded-header">
        <span className={`node-kind-badge ${kindClass}`}>
          {data.kind === SymbolKind.Struct ? 'S' : 'C'}
        </span>
        <span className="node-label">{data.label}</span>
        <span className="member-count-badge">
          {hasPinned ? `${members.length}/${data.totalMemberCount}` : data.totalMemberCount}
        </span>
      </div>

      {members.length === 0 && (
        <div className="expanded-empty">
          {data.totalMemberCount} members (none pinned)
        </div>
      )}

      {fields.length > 0 && (
        <div className="expanded-section">
          <div className="section-label">Fields</div>
          {fields.map(m => (
            <div
              key={m.id}
              className={`graph-member-row ${data.selectedMemberId === m.id ? 'active' : ''} ${m.inheritedFrom ? 'inherited' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleMemberClick(m) }}
            >
              <span className={`gm-kind kind-${m.kind}`}>
                {kindLabels[m.kind] ?? '?'}
              </span>
              <span className="gm-name" title={m.inheritedFrom ? `${m.name} (from ${m.inheritedFrom})` : m.signature ?? m.name}>{m.name}</span>
              {m.returnType && <span className="gm-type">{m.returnType}</span>}
            </div>
          ))}
        </div>
      )}

      {functions.length > 0 && (
        <div className="expanded-section">
          <div className="section-label">Methods</div>
          {functions.map(m => (
            <div
              key={m.id}
              className={`graph-member-row ${data.selectedMemberId === m.id ? 'active' : ''} ${m.inheritedFrom ? 'inherited' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleMemberClick(m) }}
            >
              <span className={`gm-kind kind-${m.kind}`}>fn</span>
              <span className="gm-name" title={m.inheritedFrom ? `${m.name} (from ${m.inheritedFrom})` : m.signature ?? m.name}>{m.name}</span>
              {m.returnType && <span className="gm-type">{m.returnType}</span>}
            </div>
          ))}
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

function buildFlowElements(
  graph: CodeGraph | null,
  selectedClassId: string | null,
  selectedMemberId: string | null,
  pinnedMemberIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  if (!graph || graph.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const baseIds = new Set<string>()
  const derivedIds = new Set<string>()
  const typeIds = new Set<string>()

  for (const edge of graph.edges) {
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

  const HORIZONTAL_GAP = 240
  const VERTICAL_GAP = 160

  const flowNodes: Node[] = []

  // Position base classes on top row
  const bases = graph.nodes.filter(n => baseIds.has(n.id))
  const baseStartX = -(bases.length - 1) * HORIZONTAL_GAP / 2
  bases.forEach((n, i) => {
    flowNodes.push({
      id: n.id,
      type: 'classNode',
      position: { x: baseStartX + i * HORIZONTAL_GAP, y: 0 },
      data: {
        label: n.name,
        kind: n.kind,
        memberCount: n.members?.length,
        isRoot: false,
      },
    })
  })

  // Position selected class in center — expanded with members
  const selected = graph.nodes.find(n => n.id === selectedClassId)
  if (selected) {
    const allMembers = selected.members ?? []
    // Show pinned members + currently selected member in graph
    const visibleIds = new Set(pinnedMemberIds)
    if (selectedMemberId) visibleIds.add(selectedMemberId)
    const displayMembers = visibleIds.size > 0
      ? allMembers.filter(m => visibleIds.has(m.id))
      : []

    // Estimate node height
    const memberRows = displayMembers.length > 0 ? displayMembers.length : 1
    const estimatedHeight = 60 + memberRows * 24 + 40

    flowNodes.push({
      id: selected.id,
      type: 'expandedClassNode',
      position: { x: 0, y: VERTICAL_GAP },
      data: {
        label: selected.name,
        kind: selected.kind,
        members: displayMembers,
        totalMemberCount: allMembers.length,
        selectedMemberId,
        isRoot: true,
      },
    })

    // Determine which type class IDs are "active" (referenced by visible members)
    const activeTypeIds = new Set<string>()
    for (const m of displayMembers) {
      if (m.typeClassId && typeIds.has(m.typeClassId)
        && !baseIds.has(m.typeClassId) && !derivedIds.has(m.typeClassId)
        && m.typeClassId !== selectedClassId) {
        activeTypeIds.add(m.typeClassId)
      }
    }

    // Position type-reference nodes to the right of center
    const typeNodesList = graph.nodes.filter(n => activeTypeIds.has(n.id))
    const typeStartY = VERTICAL_GAP + (estimatedHeight - typeNodesList.length * 80) / 2
    const TYPE_X_OFFSET = 360
    typeNodesList.forEach((n, i) => {
      flowNodes.push({
        id: n.id,
        type: 'classNode',
        position: { x: TYPE_X_OFFSET, y: Math.max(VERTICAL_GAP, typeStartY + i * 80) },
        data: {
          label: n.name,
          kind: n.kind,
          memberCount: n.members?.length,
          isRoot: false,
        },
      })
    })

    // Position derived below the expanded node
    const derived = graph.nodes.filter(n => derivedIds.has(n.id))
    const derivedY = VERTICAL_GAP + estimatedHeight + 40
    const derivedStartX = -(derived.length - 1) * HORIZONTAL_GAP / 2
    derived.forEach((n, i) => {
      flowNodes.push({
        id: n.id,
        type: 'classNode',
        position: { x: derivedStartX + i * HORIZONTAL_GAP, y: derivedY },
        data: {
          label: n.name,
          kind: n.kind,
          memberCount: n.members?.length,
          isRoot: false,
        },
      })
    })
  }

  // Edges — filter out UsesType edges for inactive type nodes
  const activeNodeIds = new Set(flowNodes.map(n => n.id))
  const flowEdges: Edge[] = graph.edges
    .filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target))
    .map(e => {
      const isUsesType = e.kind === EdgeKind.UsesType
      return {
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
        label: isUsesType ? 'type' : e.kind === EdgeKind.Inherits ? 'inherits' : e.kind,
        labelStyle: { fill: 'var(--text-muted)', fontSize: 10 },
      }
    })

  return { nodes: flowNodes, edges: flowEdges }
}

// ---- Main Component ----

export function GraphView() {
  const { graph, selectedClass, selectedMember, selectedMembers, isLoadingGraph, selectClass, createTab } = useAppStore()

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(graph, selectedClass?.id ?? null, selectedMember?.id ?? null, selectedMembers),
    [graph, selectedClass, selectedMember, selectedMembers]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when graph changes
  useMemo(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.id !== selectedClass?.id) {
        if (event.ctrlKey || event.metaKey) {
          createTab(node.id)
        } else {
          selectClass(node.id)
        }
      }
    },
    [selectedClass, selectClass, createTab]
  )

  if (isLoadingGraph) {
    return <div className="graph-placeholder">Loading graph...</div>
  }

  if (!graph || graph.nodes.length === 0) {
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
