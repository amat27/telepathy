import { describe, it, expect } from 'vitest'
import {
  findIslands,
  estimateNodeDimensions,
  layoutIslands,
  mergeGraphs,
  removeClassFromGraph,
  ISLAND_GAP,
} from '../graphLayout'
import type { GraphIsland, NodeInfo } from '../graphLayout'
import { EdgeKind, SymbolKind } from '../../types/model'
import type { CodeGraph, CodeSymbol, SymbolEdge } from '../../types/model'

// ============================================================
// Helpers
// ============================================================

function makeEdge(id: string, source: string, target: string, kind: EdgeKind = EdgeKind.Inherits): SymbolEdge {
  return { id, source, target, kind }
}

function makeNode(id: string, name?: string): CodeSymbol {
  return {
    id,
    name: name ?? id,
    qualifiedName: name ?? id,
    kind: SymbolKind.Class,
    location: { file: 'test.cpp', line: 1, column: 1 },
  }
}

function makeNodeInfo(width = 200, height = 60): NodeInfo {
  return { width, height, data: {} }
}

// ============================================================
// findIslands
// ============================================================

describe('findIslands', () => {
  it('returns 2 islands for disconnected pairs', () => {
    const islands = findIslands(
      ['A', 'B', 'C', 'D'],
      [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'C', 'D')],
    )
    expect(islands).toHaveLength(2)

    const island1 = islands.find(i => i.nodeIds.has('A'))!
    const island2 = islands.find(i => i.nodeIds.has('C'))!

    expect(island1.nodeIds).toEqual(new Set(['A', 'B']))
    expect(island1.edges).toHaveLength(1)
    expect(island2.nodeIds).toEqual(new Set(['C', 'D']))
    expect(island2.edges).toHaveLength(1)
  })

  it('returns 1 island for single node', () => {
    const islands = findIslands(['A'], [])
    expect(islands).toHaveLength(1)
    expect(islands[0].nodeIds).toEqual(new Set(['A']))
    expect(islands[0].edges).toHaveLength(0)
  })

  it('returns 1 island when all connected', () => {
    const islands = findIslands(
      ['A', 'B', 'C'],
      [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'C')],
    )
    expect(islands).toHaveLength(1)
    expect(islands[0].nodeIds).toEqual(new Set(['A', 'B', 'C']))
    expect(islands[0].edges).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(findIslands([], [])).toHaveLength(0)
  })

  it('handles 3 separate islands', () => {
    const islands = findIslands(
      ['A', 'B', 'C'],
      [],
    )
    expect(islands).toHaveLength(3)
  })
})

// ============================================================
// estimateNodeDimensions
// ============================================================

describe('estimateNodeDimensions', () => {
  it('returns compact dimensions when not expanded', () => {
    expect(estimateNodeDimensions(false)).toEqual({ width: 200, height: 60 })
  })

  it('returns expanded dimensions based on members and sections', () => {
    const result = estimateNodeDimensions(true, 5, 2)
    // 44 + 2*28 + 5*24 + 20 = 44 + 56 + 120 + 20 = 240
    expect(result).toEqual({ width: 280, height: 240 })
  })

  it('enforces minimum height of 80 for expanded', () => {
    const result = estimateNodeDimensions(true, 0, 0)
    expect(result.height).toBe(80)
  })

  it('handles large member counts', () => {
    const result = estimateNodeDimensions(true, 20, 3)
    // 44 + 3*28 + 20*24 + 20 = 44 + 84 + 480 + 20 = 628
    expect(result).toEqual({ width: 280, height: 628 })
  })
})

// ============================================================
// layoutIslands
// ============================================================

describe('layoutIslands', () => {
  it('positions two disconnected nodes with island gap', () => {
    const islands: GraphIsland[] = [
      { nodeIds: new Set(['A']), edges: [] },
      { nodeIds: new Set(['B']), edges: [] },
    ]
    const nodeMap = new Map<string, NodeInfo>([
      ['A', makeNodeInfo(200, 60)],
      ['B', makeNodeInfo(200, 60)],
    ])

    const result = layoutIslands(islands, nodeMap, null)

    const posA = result.positions.get('A')!
    const posB = result.positions.get('B')!
    expect(posA).toBeDefined()
    expect(posB).toBeDefined()

    // B's island should be offset by at least ISLAND_GAP from A's right edge
    expect(posB.x - posA.x).toBeGreaterThanOrEqual(ISLAND_GAP)
  })

  it('reverses Inherits edges for dagre (base above derived)', () => {
    const islands: GraphIsland[] = [
      {
        nodeIds: new Set(['Base', 'Derived']),
        edges: [makeEdge('e1', 'Derived', 'Base', EdgeKind.Inherits)],
      },
    ]
    const nodeMap = new Map<string, NodeInfo>([
      ['Base', makeNodeInfo()],
      ['Derived', makeNodeInfo()],
    ])

    const result = layoutIslands(islands, nodeMap, null)

    const posBase = result.positions.get('Base')!
    const posDerived = result.positions.get('Derived')!
    // In TB layout with reversed edge, Base should be above (lower y) Derived
    expect(posBase.y).toBeLessThan(posDerived.y)
  })

  it('places focused class island first', () => {
    const islands: GraphIsland[] = [
      { nodeIds: new Set(['A', 'B']), edges: [makeEdge('e1', 'A', 'B')] },
      { nodeIds: new Set(['Focused']), edges: [] },
    ]
    const nodeMap = new Map<string, NodeInfo>([
      ['A', makeNodeInfo()],
      ['B', makeNodeInfo()],
      ['Focused', makeNodeInfo()],
    ])

    const result = layoutIslands(islands, nodeMap, 'Focused')

    const posFocused = result.positions.get('Focused')!
    const posA = result.positions.get('A')!
    // Focused island should be placed first (lower x)
    expect(posFocused.x).toBeLessThan(posA.x)
  })

  it('returns empty positions for empty islands', () => {
    const result = layoutIslands([], new Map(), null)
    expect(result.positions.size).toBe(0)
  })

  it('does not reverse non-Inherits edges', () => {
    const islands: GraphIsland[] = [
      {
        nodeIds: new Set(['Caller', 'Callee']),
        edges: [makeEdge('e1', 'Caller', 'Callee', EdgeKind.Calls)],
      },
    ]
    const nodeMap = new Map<string, NodeInfo>([
      ['Caller', makeNodeInfo()],
      ['Callee', makeNodeInfo()],
    ])

    const result = layoutIslands(islands, nodeMap, null)

    const posCaller = result.positions.get('Caller')!
    const posCallee = result.positions.get('Callee')!
    // In TB layout, Caller (source) should be above Callee (target)
    expect(posCaller.y).toBeLessThan(posCallee.y)
  })
})

// ============================================================
// mergeGraphs
// ============================================================

describe('mergeGraphs', () => {
  it('returns incoming graph when existing is null', () => {
    const incoming: CodeGraph = {
      nodes: [makeNode('A')],
      edges: [makeEdge('e1', 'A', 'B')],
    }
    const result = mergeGraphs(null, incoming)
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(1)
  })

  it('deduplicates nodes by id', () => {
    const existing: CodeGraph = {
      nodes: [makeNode('A'), makeNode('B')],
      edges: [],
    }
    const incoming: CodeGraph = {
      nodes: [makeNode('B'), makeNode('C')],
      edges: [],
    }
    const result = mergeGraphs(existing, incoming)
    expect(result.nodes).toHaveLength(3)
    const ids = result.nodes.map(n => n.id).sort()
    expect(ids).toEqual(['A', 'B', 'C'])
  })

  it('deduplicates edges by id', () => {
    const existing: CodeGraph = {
      nodes: [],
      edges: [makeEdge('e1', 'A', 'B')],
    }
    const incoming: CodeGraph = {
      nodes: [],
      edges: [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'C')],
    }
    const result = mergeGraphs(existing, incoming)
    expect(result.edges).toHaveLength(2)
  })
})

// ============================================================
// removeClassFromGraph
// ============================================================

describe('removeClassFromGraph', () => {
  it('removes node and connected edges', () => {
    const graph: CodeGraph = {
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [
        makeEdge('e1', 'A', 'B'),
        makeEdge('e2', 'B', 'C'),
        makeEdge('e3', 'A', 'C'),
      ],
    }
    const result = removeClassFromGraph(graph, 'B')
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'C'])
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].id).toBe('e3')
  })

  it('returns empty graph for null input', () => {
    const result = removeClassFromGraph(null, 'A')
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('returns same graph if classId not found', () => {
    const graph: CodeGraph = {
      nodes: [makeNode('A')],
      edges: [makeEdge('e1', 'A', 'B')],
    }
    const result = removeClassFromGraph(graph, 'Z')
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(1)
  })
})
