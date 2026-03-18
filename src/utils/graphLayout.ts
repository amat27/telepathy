// ============================================================
// Graph Layout Engine — Pure functions for multi-class graph layout
// Uses dagre for hierarchical positioning with island detection
// ============================================================

import dagre from '@dagrejs/dagre'
import { EdgeKind } from '../types/model'
import type { CodeGraph, CodeSymbol, SymbolEdge } from '../types/model'

// ============================================================
// Constants
// ============================================================

/** Horizontal gap between disconnected islands */
export const ISLAND_GAP = 200

// ============================================================
// Types
// ============================================================

/** A connected component (island) in the graph */
export interface GraphIsland {
  nodeIds: Set<string>
  edges: SymbolEdge[]
}

/** Node size and metadata for layout calculation */
export interface NodeInfo {
  width: number
  height: number
  data: Record<string, unknown>
}

/** Layout output — positions keyed by node id */
export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>
}

// ============================================================
// Island Detection (BFS connected components)
// ============================================================

/**
 * Find connected components (islands) in the graph.
 * Uses undirected BFS — an edge connects nodes in both directions.
 */
export function findIslands(nodeIds: string[], edges: SymbolEdge[]): GraphIsland[] {
  // Build undirected adjacency list
  const adj = new Map<string, Set<string>>()
  for (const id of nodeIds) {
    adj.set(id, new Set())
  }
  for (const edge of edges) {
    adj.get(edge.source)?.add(edge.target)
    adj.get(edge.target)?.add(edge.source)
  }

  const visited = new Set<string>()
  const islands: GraphIsland[] = []

  for (const startId of nodeIds) {
    if (visited.has(startId)) continue

    // BFS from this node
    const component = new Set<string>()
    const queue = [startId]
    visited.add(startId)

    while (queue.length > 0) {
      const current = queue.shift()!
      component.add(current)

      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    // Collect edges belonging to this island
    const islandEdges = edges.filter(
      e => component.has(e.source) && component.has(e.target),
    )

    islands.push({ nodeIds: component, edges: islandEdges })
  }

  return islands
}

// ============================================================
// Node Dimension Estimation
// ============================================================

/**
 * Estimate the pixel dimensions of a node for layout.
 * Compact: small rectangle for non-expanded class nodes.
 * Expanded: taller rectangle based on member count and section headers.
 */
export function estimateNodeDimensions(
  isExpanded: boolean,
  memberCount: number = 0,
  sectionCount: number = 0,
): { width: number; height: number } {
  if (!isExpanded) {
    return { width: 200, height: 60 }
  }
  // Expanded: header(44) + sections(28 each) + members(24 each) + padding(20)
  const height = Math.max(80, 44 + sectionCount * 28 + memberCount * 24 + 20)
  return { width: 280, height }
}

// ============================================================
// Dagre Layout with Island Positioning
// ============================================================

/**
 * Layout all islands using dagre, then position islands side by side.
 *
 * CRITICAL: Inherits edges are reversed for dagre so base classes rank above
 * derived classes in the top-to-bottom layout.
 *
 * @param islands - Connected components from findIslands
 * @param nodeMap - Dimensions and data for each node
 * @param focusedClassId - The focused class gets its island placed first
 */
export function layoutIslands(
  islands: GraphIsland[],
  nodeMap: Map<string, NodeInfo>,
  focusedClassId: string | null,
): LayoutResult {
  const positions = new Map<string, { x: number; y: number }>()

  if (islands.length === 0) return { positions }

  // Sort islands: focused island first, then by size descending
  const sorted = [...islands].sort((a, b) => {
    const aHasFocus = focusedClassId != null && a.nodeIds.has(focusedClassId)
    const bHasFocus = focusedClassId != null && b.nodeIds.has(focusedClassId)
    if (aHasFocus && !bHasFocus) return -1
    if (!aHasFocus && bHasFocus) return 1
    return b.nodeIds.size - a.nodeIds.size
  })

  let xOffset = 0

  for (const island of sorted) {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 120, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))

    // Add nodes
    for (const nodeId of island.nodeIds) {
      const info = nodeMap.get(nodeId)
      if (info) {
        g.setNode(nodeId, { width: info.width, height: info.height })
      } else {
        // Fallback dimensions
        g.setNode(nodeId, { width: 200, height: 60 })
      }
    }

    // Add edges — REVERSE Inherits so base ranks above derived
    for (const edge of island.edges) {
      if (edge.kind === EdgeKind.Inherits) {
        g.setEdge(edge.target, edge.source)
      } else {
        g.setEdge(edge.source, edge.target)
      }
    }

    // Run dagre layout
    dagre.layout(g)

    // Find bounding box for this island
    let minX = Infinity
    let maxX = -Infinity

    for (const nodeId of island.nodeIds) {
      const dagreNode = g.node(nodeId)
      if (!dagreNode) continue

      const info = nodeMap.get(nodeId)
      const w = info?.width ?? 200
      const h = info?.height ?? 60

      // Convert dagre center-anchor to top-left
      const x = dagreNode.x - w / 2 + xOffset
      const y = dagreNode.y - h / 2

      positions.set(nodeId, { x, y })

      // Track bounding box
      if (dagreNode.x - w / 2 < minX) minX = dagreNode.x - w / 2
      if (dagreNode.x + w / 2 > maxX) maxX = dagreNode.x + w / 2
    }

    // Move xOffset past this island
    if (minX !== Infinity) {
      xOffset += (maxX - minX) + ISLAND_GAP
    }
  }

  return { positions }
}

// ============================================================
// Graph Merging & Removal
// ============================================================

/**
 * Merge two CodeGraphs, deduplicating by id.
 * If existing is null, returns the incoming graph.
 */
export function mergeGraphs(existing: CodeGraph | null, incoming: CodeGraph): CodeGraph {
  if (!existing) return { nodes: [...incoming.nodes], edges: [...incoming.edges] }

  const nodeMap = new Map<string, CodeSymbol>()
  for (const node of existing.nodes) nodeMap.set(node.id, node)
  for (const node of incoming.nodes) nodeMap.set(node.id, node)

  const edgeMap = new Map<string, SymbolEdge>()
  for (const edge of existing.edges) edgeMap.set(edge.id, edge)
  for (const edge of incoming.edges) edgeMap.set(edge.id, edge)

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  }
}

/**
 * Remove a class and all its connected edges from a CodeGraph.
 */
export function removeClassFromGraph(graph: CodeGraph | null, classId: string): CodeGraph {
  if (!graph) return { nodes: [], edges: [] }

  return {
    nodes: graph.nodes.filter(n => n.id !== classId),
    edges: graph.edges.filter(e => e.source !== classId && e.target !== classId),
  }
}
