import { describe, it, expect } from 'vitest'
import { buildFlowElements } from '../GraphView'
import type { ClassNodeData, ExpandedNodeData } from '../GraphView'
import { EdgeKind, SymbolKind } from '../../../types/model'
import type { CodeGraph, CodeSymbol, SymbolEdge, PinnedMember } from '../../../types/model'
import { ISLAND_GAP } from '../../../utils/graphLayout'

// ============================================================
// Helpers
// ============================================================

function makeSymbol(id: string, name?: string, kind = SymbolKind.Class, members?: CodeSymbol[]): CodeSymbol {
  return {
    id,
    name: name ?? id,
    qualifiedName: name ?? id,
    kind,
    location: { file: 'test.cpp', line: 1, column: 1 },
    members,
  }
}

function makeMember(id: string, name?: string, kind = SymbolKind.Member, typeClassId?: string): CodeSymbol {
  return {
    ...makeSymbol(id, name, kind),
    typeClassId,
  }
}

function makeEdge(id: string, source: string, target: string, kind: EdgeKind): SymbolEdge {
  return { id, source, target, kind }
}

/** Get bounding box of a node given position + estimated dimensions */
function nodeBounds(pos: { x: number; y: number }, width: number, height: number) {
  return {
    left: pos.x,
    right: pos.x + width,
    top: pos.y,
    bottom: pos.y + height,
  }
}

/** Check two rectangles don't overlap */
function noOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
}

const EMPTY_PINNED_MEMBERS = new Map<string, PinnedMember>()
const EMPTY_PINNED_CLASSES = new Map<string, CodeSymbol>()
const EMPTY_MEMBER_IDS = new Set<string>()

// Approximate dimensions (must match estimateNodeDimensions)
const COMPACT_W = 200
const COMPACT_H = 60
const EXPANDED_W = 280

// ============================================================
// Tests
// ============================================================

describe('buildFlowElements', () => {
  describe('empty state', () => {
    it('returns empty for null graph and no pinned classes', () => {
      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
    })
  })

  describe('hierarchy mode — basic layout', () => {
    it('creates expanded node for selected class', () => {
      const members = [makeMember('m1', 'foo', SymbolKind.MemberFunction)]
      const graph: CodeGraph = {
        nodes: [makeSymbol('A', 'ClassA', SymbolKind.Class, members)],
        edges: [],
      }
      const result = buildFlowElements(graph, 'A', null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].type).toBe('expandedClassNode')
      expect(result.nodes[0].id).toBe('A')
    })

    it('places base above selected (lower y)', () => {
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Base', 'Base'),
          makeSymbol('Derived', 'Derived', SymbolKind.Class, []),
        ],
        edges: [
          makeEdge('e1', 'Derived', 'Base', EdgeKind.Inherits),
        ],
      }
      const result = buildFlowElements(graph, 'Derived', null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)

      const baseNode = result.nodes.find(n => n.id === 'Base')!
      const derivedNode = result.nodes.find(n => n.id === 'Derived')!
      expect(baseNode.type).toBe('classNode')
      expect(derivedNode.type).toBe('expandedClassNode')
      // Base should be above (lower y) due to Inherits edge reversal in dagre
      expect(baseNode.position.y).toBeLessThan(derivedNode.position.y)
    })

    it('places derived below selected (higher y)', () => {
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Parent', 'Parent', SymbolKind.Class, []),
          makeSymbol('Child', 'Child'),
        ],
        edges: [
          makeEdge('e1', 'Child', 'Parent', EdgeKind.Inherits),
        ],
      }
      const result = buildFlowElements(graph, 'Parent', null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)

      const parentNode = result.nodes.find(n => n.id === 'Parent')!
      const childNode = result.nodes.find(n => n.id === 'Child')!
      expect(parentNode.position.y).toBeLessThan(childNode.position.y)
    })
  })

  describe('pinned classes layout', () => {
    it('shows pinned classes even without graph', () => {
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'PinnedA')],
      ])
      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].id).toBe('P1')
      const data = result.nodes[0].data as ClassNodeData
      expect(data.isPinned).toBe(true)
    })

    it('pinned classes do not overlap with each other', () => {
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'PinnedA')],
        ['P2', makeSymbol('P2', 'PinnedB')],
        ['P3', makeSymbol('P3', 'PinnedC')],
      ])
      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(3)

      // Check no pair overlaps
      for (let i = 0; i < result.nodes.length; i++) {
        for (let j = i + 1; j < result.nodes.length; j++) {
          const a = nodeBounds(result.nodes[i].position, COMPACT_W, COMPACT_H)
          const b = nodeBounds(result.nodes[j].position, COMPACT_W, COMPACT_H)
          expect(noOverlap(a, b)).toBe(true)
        }
      }
    })

    it('pinned classes do not overlap selected class hierarchy', () => {
      const members = [makeMember('m1', 'field1')]
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Base', 'Base'),
          makeSymbol('Sel', 'Selected', SymbolKind.Class, members),
          makeSymbol('Child', 'Child'),
        ],
        edges: [
          makeEdge('e1', 'Sel', 'Base', EdgeKind.Inherits),
          makeEdge('e2', 'Child', 'Sel', EdgeKind.Inherits),
        ],
      }
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'Pinned1')],
        ['P2', makeSymbol('P2', 'Pinned2')],
      ])

      const result = buildFlowElements(graph, 'Sel', null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(5) // Base + Sel + Child + P1 + P2

      // Use generous bounding boxes to verify no overlap
      for (let i = 0; i < result.nodes.length; i++) {
        for (let j = i + 1; j < result.nodes.length; j++) {
          const w = result.nodes[i].type === 'expandedClassNode' ? EXPANDED_W : COMPACT_W
          const w2 = result.nodes[j].type === 'expandedClassNode' ? EXPANDED_W : COMPACT_W
          const a = nodeBounds(result.nodes[i].position, w, COMPACT_H)
          const b = nodeBounds(result.nodes[j].position, w2, COMPACT_H)
          expect(noOverlap(a, b)).toBe(true)
        }
      }
    })

    it('connected pinned classes via type edges are in same island', () => {
      // Pinned class P1 with member whose typeClassId points to P2
      const memberWithType = makeMember('m1', 'field', SymbolKind.Member, 'P2')
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'ClassA', SymbolKind.Class, [memberWithType])],
        ['P2', makeSymbol('P2', 'ClassB')],
      ])
      const pinnedMembers = new Map<string, PinnedMember>([
        ['m1', { member: memberWithType, classId: 'P1', className: 'ClassA' }],
      ])

      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, pinnedClasses, pinnedMembers)
      expect(result.nodes).toHaveLength(2)

      // Should have a type edge between them
      const typeEdge = result.edges.find(e => e.source === 'P1' && e.target === 'P2')
      expect(typeEdge).toBeDefined()

      // Nodes should not overlap
      const n1 = result.nodes.find(n => n.id === 'P1')!
      const n2 = result.nodes.find(n => n.id === 'P2')!
      const a = nodeBounds(n1.position, EXPANDED_W, 120)
      const b = nodeBounds(n2.position, COMPACT_W, COMPACT_H)
      expect(noOverlap(a, b)).toBe(true)
    })

    it('disconnected pinned classes are separated by island gap', () => {
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'IsolatedA')],
        ['P2', makeSymbol('P2', 'IsolatedB')],
      ])
      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)

      const n1 = result.nodes.find(n => n.id === 'P1')!
      const n2 = result.nodes.find(n => n.id === 'P2')!

      // Islands are placed side by side, gap between right edge of one and left edge of next
      const rightEdge1 = n1.position.x + COMPACT_W
      const leftEdge2 = n2.position.x
      const rightEdge2 = n2.position.x + COMPACT_W
      const leftEdge1 = n1.position.x

      // One of them should be to the right with at least ISLAND_GAP spacing
      const gap = Math.max(leftEdge2 - rightEdge1, leftEdge1 - rightEdge2)
      expect(gap).toBeGreaterThanOrEqual(ISLAND_GAP - 1) // -1 for rounding
    })

    it('pinned expanded node shows pinned members', () => {
      const member = makeMember('m1', 'myField', SymbolKind.Member, 'TypeClass')
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['P1', makeSymbol('P1', 'MyClass', SymbolKind.Class, [member, makeMember('m2', 'other')])],
      ])
      const pinnedMembers = new Map<string, PinnedMember>([
        ['m1', { member, classId: 'P1', className: 'MyClass' }],
      ])

      const result = buildFlowElements(null, null, null, EMPTY_MEMBER_IDS, pinnedClasses, pinnedMembers)
      expect(result.nodes).toHaveLength(1)

      const node = result.nodes[0]
      expect(node.type).toBe('expandedClassNode')
      const data = node.data as ExpandedNodeData
      expect(data.members).toHaveLength(1)
      expect(data.members[0].name).toBe('myField')
      expect(data.isPinned).toBe(true)
      expect(data.pinnedMemberIds.has('m1')).toBe(true)
    })
  })

  describe('callstack mode', () => {
    it('uses vertical layout for callstack (no selected class)', () => {
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('F1', 'funcA', SymbolKind.Function),
          makeSymbol('F2', 'funcB', SymbolKind.Function),
        ],
        edges: [makeEdge('e1', 'F1', 'F2', EdgeKind.Calls)],
      }
      // No selectedClassId → callstack mode
      const result = buildFlowElements(graph, null, null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(2)
      // Callstack uses fixed vertical gap of 140
      expect(result.nodes[0].position).toEqual({ x: 0, y: 0 })
      expect(result.nodes[1].position).toEqual({ x: 0, y: 140 })
    })
  })

  describe('edge generation', () => {
    it('generates Inherits edge between base and selected', () => {
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Base', 'Base'),
          makeSymbol('Sel', 'Selected', SymbolKind.Class, []),
        ],
        edges: [makeEdge('e1', 'Sel', 'Base', EdgeKind.Inherits)],
      }
      const result = buildFlowElements(graph, 'Sel', null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].id).toBe('e1')
    })

    it('generates pin-type edge for pinned member with typeClassId', () => {
      const member = makeMember('m1', 'ptr', SymbolKind.Member, 'TypeCls')
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Sel', 'Selected', SymbolKind.Class, [member]),
          makeSymbol('TypeCls', 'TypeClass'),
        ],
        edges: [makeEdge('e1', 'Sel', 'TypeCls', EdgeKind.UsesType)],
      }
      const pinnedMembers = new Map<string, PinnedMember>([
        ['m1', { member, classId: 'Sel', className: 'Selected' }],
      ])
      const pinnedMemberIds = new Set(['m1'])

      const result = buildFlowElements(graph, 'Sel', null, pinnedMemberIds, EMPTY_PINNED_CLASSES, pinnedMembers)

      // Should have original graph edge + pin-type edge
      const pinEdge = result.edges.find(e => e.id === 'pin-type-m1')
      expect(pinEdge).toBeDefined()
      expect(pinEdge!.source).toBe('Sel')
      expect(pinEdge!.target).toBe('TypeCls')
    })

    it('excludes edges to nodes not in graph', () => {
      const graph: CodeGraph = {
        nodes: [makeSymbol('A', 'A', SymbolKind.Class, [])],
        edges: [makeEdge('e1', 'A', 'Ghost', EdgeKind.Inherits)],
      }
      const result = buildFlowElements(graph, 'A', null, EMPTY_MEMBER_IDS, EMPTY_PINNED_CLASSES, EMPTY_PINNED_MEMBERS)
      expect(result.edges).toHaveLength(0) // Ghost is not in descriptors
    })
  })

  describe('mixed hierarchy + pinned', () => {
    it('all nodes get valid positions', () => {
      const members = [
        makeMember('m1', 'field1', SymbolKind.Member),
        makeMember('m2', 'method1', SymbolKind.MemberFunction),
      ]
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Base', 'Base'),
          makeSymbol('Sel', 'Selected', SymbolKind.Class, members),
        ],
        edges: [makeEdge('e1', 'Sel', 'Base', EdgeKind.Inherits)],
      }
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['PX', makeSymbol('PX', 'ExtraClass')],
      ])

      const result = buildFlowElements(graph, 'Sel', null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)
      expect(result.nodes).toHaveLength(3) // Base + Sel + PX

      for (const node of result.nodes) {
        expect(typeof node.position.x).toBe('number')
        expect(typeof node.position.y).toBe('number')
        expect(Number.isFinite(node.position.x)).toBe(true)
        expect(Number.isFinite(node.position.y)).toBe(true)
      }
    })

    it('isPinned flag is set correctly on hierarchy nodes that are also pinned', () => {
      const graph: CodeGraph = {
        nodes: [
          makeSymbol('Base', 'Base'),
          makeSymbol('Sel', 'Selected', SymbolKind.Class, []),
        ],
        edges: [makeEdge('e1', 'Sel', 'Base', EdgeKind.Inherits)],
      }
      const pinnedClasses = new Map<string, CodeSymbol>([
        ['Base', makeSymbol('Base', 'Base')], // Base is also pinned
      ])

      const result = buildFlowElements(graph, 'Sel', null, EMPTY_MEMBER_IDS, pinnedClasses, EMPTY_PINNED_MEMBERS)
      const baseNode = result.nodes.find(n => n.id === 'Base')!
      const data = baseNode.data as ClassNodeData
      expect(data.isPinned).toBe(true)
    })
  })
})
