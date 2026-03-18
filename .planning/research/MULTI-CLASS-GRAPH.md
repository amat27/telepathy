# Multi-Class Graph Layout with Island Support

**Project:** Telepathy
**Researched:** 2026-03-17
**Confidence:** HIGH (verified against @xyflow/react v12 official docs + working codebase)

---

## 1. Executive Summary

The current `GraphView` uses a hard-coded manual layout that positions one selected class at center, bases above, derived below, type-refs to the right. This works for single-class exploration but breaks down when the user pins 2-10 classes simultaneously. We need:

1. **Automatic layout** of a multi-root directed graph (inheritance + type-reference edges)
2. **Island detection** to separate disconnected clusters visually
3. **Dynamic re-layout** when classes are pinned/unpinned
4. **Variable-size nodes** (expanded class nodes with member lists are much taller than compact class nodes)

**Recommendation: Use `@dagrejs/dagre` with a custom island-aware wrapper.** Dagre is the right tool because it handles multi-root DAGs, supports variable node sizes, runs synchronously (~40KB bundle), and is explicitly recommended by the xyflow team for tree-like layouts. ELK is overkill for 2-10 nodes and adds 1.4MB of bundle weight. The island spacing problem is simple enough to solve with a 20-line connected-components algorithm + offset.

---

## 2. Layout Library Comparison

### Decision: Dagre (recommended)

| Criterion | Dagre | ELK | D3-Force | Custom (current) |
|-----------|-------|-----|----------|-------------------|
| Bundle size | ~40KB | ~1.4MB | ~16KB | 0 |
| Variable node sizes | Yes | Yes | Yes | Manual |
| Multi-root graphs | Yes | Yes | N/A | No |
| Disconnected components | No (manual) | Yes (built-in) | No (manual) | No |
| Sync/Async | Sync | Async | Iterative | Sync |
| Sub-flow layouting | Yes* | Yes | No | No |
| Complexity | Low | Very High | Medium | Low |
| xyflow recommendation | "Highly recommend" | "Good luck with docs" | For force-directed only | N/A |

*Dagre has an open issue (#238) with sub-flows connected to external nodes, but this doesn't affect us since we aren't using xyflow sub-flows.

**Why not ELK?** ELK natively handles disconnected components (`elk.separateConnectedComponents`), which is tempting. However:
- 1.4MB bundle is excessive for an Electron app rendering ≤10 nodes
- Async API requires a `useLayoutEffect` + state coordination dance
- The ELK reference documentation is infamously difficult to navigate
- For 2-10 class nodes, the layout quality difference is negligible
- Island detection is trivially implementable (~20 lines) without ELK

**Why not D3-Force?** Force-directed layout is wrong for class hierarchies. Inheritance has a clear directional flow (parent → child); force layouts lose this semantic directionality. Also requires an iterative simulation loop, adding complexity for no benefit.

**Why not keep manual layout?** The current approach hard-codes positions relative to a single selected class. With 2-10 pinned classes, each potentially with its own bases/derived, manual positioning becomes combinatorially complex. Dagre solves this generically.

### Installation

```bash
npm install @dagrejs/dagre
npm install -D @types/dagre  # types are in DefinitelyTyped
```

---

## 3. Island Detection (Connected Components)

### The Problem

When user pins ClassA and ClassC with no relationship between them, they form two "islands" (disconnected components). Without island detection, dagre would lay them out in one graph with awkward spacing.

### Algorithm: Union-Find (simple BFS variant)

Connected component detection is a standard O(V+E) algorithm. For ≤10 nodes and ≤30 edges, even the simplest BFS approach is instantaneous.

```typescript
// ============================================================
// Island Detection — find connected components in a graph
// ============================================================

interface GraphIsland {
  nodeIds: Set<string>
  edges: Array<{ source: string; target: string }>
}

function findIslands(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
): GraphIsland[] {
  // Build adjacency list (undirected for connectivity)
  const adj = new Map<string, Set<string>>()
  for (const id of nodeIds) adj.set(id, new Set())
  for (const e of edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  const visited = new Set<string>()
  const islands: GraphIsland[] = []

  for (const startId of nodeIds) {
    if (visited.has(startId)) continue
    const component = new Set<string>()
    const queue = [startId]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      component.add(id)
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }
    const islandEdges = edges.filter(
      e => component.has(e.source) && component.has(e.target)
    )
    islands.push({ nodeIds: component, edges: islandEdges })
  }

  return islands
}
```

**Confidence: HIGH** — this is textbook graph theory, not library-specific.

---

## 4. Island Positioning Strategy

After dagre lays out each island independently, we need to position the islands relative to each other so they don't overlap and have clear visual spacing.

### Approach: Horizontal strip packing

1. Run dagre separately for each island
2. Compute bounding box of each island's layouted nodes
3. Place islands left-to-right with `ISLAND_GAP` (e.g., 200px) between them
4. Center the active/selected island or the largest island

```typescript
// ============================================================
// Island Layout — position disconnected components side by side
// ============================================================

import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

const ISLAND_GAP = 200

interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

function layoutIslands(
  islands: GraphIsland[],
  nodeMap: Map<string, { width: number; height: number; data: any }>,
  allEdges: Edge[],
  selectedClassId: string | null,
): LayoutResult {
  const allNodes: Node[] = []
  let xOffset = 0

  // Sort: put island containing selected class first (centered)
  const sorted = [...islands].sort((a, b) => {
    const aHasSelected = selectedClassId && a.nodeIds.has(selectedClassId) ? -1 : 0
    const bHasSelected = selectedClassId && b.nodeIds.has(selectedClassId) ? 1 : 0
    return aHasSelected || bHasSelected || b.nodeIds.size - a.nodeIds.size
  })

  for (const island of sorted) {
    // Create fresh dagre graph for this island
    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
    g.setGraph({
      rankdir: 'TB',        // top-to-bottom: bases above, derived below
      nodesep: 60,          // horizontal spacing between nodes in same rank
      ranksep: 120,         // vertical spacing between ranks
      marginx: 20,
      marginy: 20,
    })

    for (const id of island.nodeIds) {
      const info = nodeMap.get(id)!
      g.setNode(id, { width: info.width, height: info.height })
    }
    for (const e of island.edges) {
      g.setEdge(e.source, e.target)
    }

    dagre.layout(g)

    // Find bounding box of this island
    let minX = Infinity, maxX = -Infinity
    for (const id of island.nodeIds) {
      const dagreNode = g.node(id)
      const info = nodeMap.get(id)!
      minX = Math.min(minX, dagreNode.x - info.width / 2)
      maxX = Math.max(maxX, dagreNode.x + info.width / 2)
    }

    const islandWidth = maxX - minX

    // Position nodes with xOffset applied
    for (const id of island.nodeIds) {
      const dagreNode = g.node(id)
      const info = nodeMap.get(id)!
      allNodes.push({
        id,
        type: info.data.isExpanded ? 'expandedClassNode' : 'classNode',
        position: {
          x: dagreNode.x - info.width / 2 + xOffset - minX,
          y: dagreNode.y - info.height / 2,
        },
        data: info.data,
      })
    }

    xOffset += islandWidth + ISLAND_GAP
  }

  // Edges pass through unchanged (xyflow handles routing)
  const activeNodeIds = new Set(allNodes.map(n => n.id))
  const layoutedEdges = allEdges.filter(
    e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target)
  )

  return { nodes: allNodes, edges: layoutedEdges }
}
```

### Visual Result

```
┌─────────────┐     ISLAND_GAP     ┌─────────────┐
│  Island 1   │  ←── 200px ──→    │  Island 2   │
│ ClassA      │                    │ ClassC      │
│   ↑         │                    │   ↑         │
│ ClassB      │                    │ ClassD      │
└─────────────┘                    └─────────────┘
```

---

## 5. Dynamic Node Sizes (Variable Height)

The biggest challenge: expanded class nodes have variable heights depending on member count. Dagre handles this natively — you just tell it the width/height of each node.

### Estimating Node Dimensions

```typescript
// Node dimension estimation (before dagre layout)
function estimateNodeDimensions(
  classSymbol: CodeSymbol,
  isExpanded: boolean,
  visibleMembers: CodeSymbol[],
): { width: number; height: number } {
  if (!isExpanded) {
    // Compact class node: fixed size
    return { width: 200, height: 60 }
  }

  // Expanded: header (44px) + section headers (~24px each) + member rows (24px each) + padding
  const memberRows = visibleMembers.length
  const sectionCount = countSections(visibleMembers) // fields section + methods section
  const height = 44 + sectionCount * 28 + memberRows * 24 + 20
  const width = 280 // expanded nodes are wider

  return { width, height: Math.max(80, height) }
}

function countSections(members: CodeSymbol[]): number {
  const hasFunctions = members.some(
    m => m.kind === SymbolKind.MemberFunction || m.kind === SymbolKind.Function
  )
  const hasFields = members.some(
    m => m.kind !== SymbolKind.MemberFunction && m.kind !== SymbolKind.Function
  )
  return (hasFunctions ? 1 : 0) + (hasFields ? 1 : 0)
}
```

### Two-Pass Layout (Measure → Layout)

**Problem:** React Flow custom nodes render at actual size, which may differ from our estimate. The dagre layout uses estimated dimensions.

**Solution for our case:** Since our nodes are deterministic (we know member count ahead of time), estimation is reliable. We do NOT need a two-pass measure-then-layout approach. The estimation above will be accurate within a few pixels.

**If we later need pixel-perfect layout:** Use `useNodesInitialized()` hook to detect when nodes have rendered, measure actual DOM dimensions, then re-layout. But this causes a visible "jump" and is unnecessary for our use case.

---

## 6. Dagre Edge Direction Semantics

Dagre's `setEdge(source, target)` positions `source` above `target` in TB mode. This maps perfectly to our inheritance model:

| Edge Kind | Dagre Call | Visual Result |
|-----------|-----------|---------------|
| Inherits (A inherits B) | `g.setEdge(B, A)` or `g.setEdge(A, B)` depending on direction | B (base) above A (derived) |
| UsesType (member of A has type B) | `g.setEdge(A, B)` | A to the left/above B |

**Important:** Our `EdgeKind.Inherits` edges have `source = derived class`, `target = base class` (i.e., "A inherits from B" means edge from A→B). For dagre TB layout, we want bases on top, so we should pass edges as `g.setEdge(edge.target, edge.source)` to reverse the direction for inherits edges. This puts bases in higher ranks.

```typescript
for (const e of island.edges) {
  if (e.kind === EdgeKind.Inherits) {
    // Reverse: put base class (target) above derived (source)
    g.setEdge(e.target, e.source)
  } else {
    g.setEdge(e.source, e.target)
  }
}
```

---

## 7. Incremental Layout (Pin/Unpin Dynamics)

### When Layout Must Recalculate

- Class pinned → add to graph, recalculate
- Class unpinned → remove from graph, recalculate
- Class expanded/collapsed → dimensions change, recalculate
- Member pinned/unpinned → expanded node height changes, recalculate

### Strategy: Full Re-layout (Not Incremental)

For 2-10 nodes, dagre layout is sub-millisecond. There is no performance reason to do incremental layout. Full re-layout on every change is simpler and guarantees optimal positioning.

```typescript
// In the store or component: recompute layout whenever these change
const layoutDeps = [pinnedClassIds, selectedClassId, expandedStates, visibleMembers]

const { nodes, edges } = useMemo(() => {
  return computeMultiClassLayout(pinnedClassIds, selectedClassId, /* ... */)
}, layoutDeps)
```

### Preserving User's Mental Map

After re-layout, use `fitView` with animation to smoothly transition:

```typescript
const { fitView } = useReactFlow()

useEffect(() => {
  // After nodes update, animate viewport to fit all nodes
  setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
}, [nodes])
```

**Optional enhancement:** Preserve positions of nodes that didn't change by caching previous positions and only updating positions for nodes that were added/removed. This reduces visual disruption but adds complexity. Recommend deferring this to a later iteration.

---

## 8. @xyflow/react Sub-Flows and Grouping

### What Sub-Flows Are

React Flow supports parent-child node relationships via `parentId` property. Child nodes are positioned relative to their parent and move with it. The `group` node type provides a container with no handles.

### Should We Use Sub-Flows for Members?

**No.** Our expanded class nodes already render members as DOM elements inside the custom node component. This is simpler and more performant than creating individual React Flow nodes for each member. Sub-flows would:

- Create 10-50 additional React Flow nodes per expanded class (one per member)
- Require managing parent-child relationships in the node array
- Complicate the dagre layout (dagre has a known bug #238 with sub-flow nodes connected externally)
- Add unnecessary rendering overhead

**Current approach is correct:** Members are rendered as DOM rows inside `ExpandedClassNode`, not as individual graph nodes. Keep this.

### When Sub-Flows Could Be Useful

If we later want members to be independently connectable (e.g., "field X in ClassA references ClassB"), we might use sub-flows. But our current `UsesType` edges connect at the class level, not the member level. Cross that bridge when we get there.

---

## 9. Store Changes Required

The current store has `selectedClass: CodeSymbol | null` (single class) and `graph: CodeGraph | null` (single hierarchy). For multi-class support:

```typescript
// New store fields needed
interface MultiClassState {
  // Replace single selectedClass with:
  pinnedClassIds: Set<string>           // all pinned class IDs
  pinnedClasses: Map<string, CodeSymbol> // id → full detail
  focusedClassId: string | null         // currently "active" for code preview

  // Replace single graph with:
  multiGraph: CodeGraph | null          // union of all hierarchies

  // Keep existing:
  selectedMember: CodeSymbol | null
  selectedMembers: Set<string>          // per-class member pins (may need per-class scoping)
}
```

### Data Fetching Strategy

When a class is pinned, we need to:
1. Fetch its detail (members) via `getClassDetail(classId)`
2. Fetch its hierarchy (edges) via `getClassHierarchy(classId)`
3. Merge into the union graph (deduplicate nodes/edges by ID)

```typescript
pinClass: async (classId: string) => {
  const [detail, hierarchy] = await Promise.all([
    api.getClassDetail(classId),
    api.getClassHierarchy(classId),
  ])

  set(state => {
    const newPinned = new Set(state.pinnedClassIds).add(classId)
    const newClasses = new Map(state.pinnedClasses).set(classId, detail)

    // Merge hierarchy into multi-graph
    const multiGraph = mergeGraphs(state.multiGraph, hierarchy)

    return { pinnedClassIds: newPinned, pinnedClasses: newClasses, multiGraph }
  })
}
```

---

## 10. Performance Considerations

### React Flow Performance with 2-10 Nodes

This is a non-issue. React Flow's stress test shows it handling hundreds of nodes. Our maximum of ~10 expanded class nodes with ~30 member rows each is trivially small.

### Key Performance Best Practices (from official docs)

1. **Memoize custom node components** with `React.memo`:
   ```typescript
   const ClassNode = memo(function ClassNode({ data }: NodeProps<Node<ClassNodeData>>) {
     // ...
   })
   ```

2. **Memoize event handlers** with `useCallback`

3. **Avoid `useNodes()` in components** — subscribe to specific state via `useStore` with selectors

4. **Declare `nodeTypes` outside the component** (currently correct in our code)

### Current Code Issue

The existing `GraphView` has `nodeTypes` defined at module level (good), but the `buildFlowElements` function is called inside `useMemo` with the right deps (good). However, it uses `useNodesState`/`useEdgesState` with a `useMemo` sync hack that should be replaced with a proper controlled flow pattern:

```typescript
// CURRENT (problematic — useMemo for side effects)
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
useMemo(() => { setNodes(initialNodes) }, [initialNodes])

// BETTER — pass nodes directly to ReactFlow (controlled mode)
<ReactFlow
  nodes={layoutedNodes}
  edges={layoutedEdges}
  onNodesChange={onNodesChange}  // only for drag position updates
/>
```

---

## 11. Complete Layout Pipeline

```
┌─────────────────────────────────────────────────────┐
│ 1. Collect Input                                     │
│    - pinnedClassIds, pinnedClasses (with members)    │
│    - multiGraph (merged edges from all hierarchies)  │
│    - selectedClassId (for visual distinction)         │
│    - expandedStates (which classes show members)      │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 2. Filter Graph                                      │
│    - Only include pinned classes as primary nodes     │
│    - Include non-pinned classes that appear in edges  │
│      between pinned classes (bases, derived, types)   │
│    - Decide which to show as compact vs expanded      │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 3. Estimate Node Dimensions                          │
│    - Compact: 200×60                                 │
│    - Expanded: 280×(44 + sections + members*24 + 20) │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 4. Detect Islands                                    │
│    - BFS connected components on node+edge graph     │
│    - Result: Array<{ nodeIds, edges }>               │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 5. Layout Each Island with Dagre                     │
│    - Independent dagre graph per island              │
│    - TB direction, custom rank/node separation       │
│    - Reverse inherit edges for correct rank order    │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 6. Position Islands                                  │
│    - Compute bounding box per island                 │
│    - Place horizontally with ISLAND_GAP spacing      │
│    - Center island containing selected class         │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 7. Build React Flow Elements                         │
│    - Map to Node[] with correct types and positions  │
│    - Map to Edge[] with correct styles               │
│    - Pass to <ReactFlow> in controlled mode          │
│    - fitView() with animation                        │
└─────────────────────────────────────────────────────┘
```

---

## 12. What Non-Pinned Classes to Show

When ClassA is pinned and inherits from ClassB (not pinned), should ClassB appear?

**Recommendation:** Show "one-hop" related classes as compact nodes. Specifically:
- Direct base classes of any pinned class → show as compact node above
- Direct derived classes of any pinned class → show as compact node below  
- Type-referenced classes of visible members → show as compact node to right

This matches the current single-class behavior but extends it to multiple pinned classes.

**Clicking a compact (non-pinned) node** should navigate to it (current behavior: `selectClass`). **Ctrl+clicking** should pin it.

---

## 13. Edge Styling per Relationship Type

Keep current styling approach but ensure edges between islands are impossible (they can't exist by definition). Style matrix:

| Edge Kind | Color | Style | Marker | Animated |
|-----------|-------|-------|--------|----------|
| Inherits | `--color-inherit-edge` | Solid, 2px | ArrowClosed | No |
| UsesType | `--color-type-edge` | Dashed, 1.5px | ArrowClosed | Yes |
| Calls | `--color-call-edge` | Solid, 1.5px | ArrowClosed | No |

---

## 14. Selected Class Visual Distinction

The focused/selected class among pinned classes needs visual distinction. Options:

1. **Ring/glow effect** — CSS `box-shadow` on the expanded node (easiest, recommended)
2. **Different background** — slightly brighter/different bg for selected
3. **Badge/icon** — "focused" indicator in the header

```css
.expanded-class-node.focused {
  box-shadow: 0 0 0 3px var(--text-accent), 0 0 12px rgba(var(--accent-rgb), 0.3);
}
```

Pass `isFocused: boolean` in node data, apply class conditionally.

---

## 15. Key Pitfalls

### Pitfall 1: Dagre Center-Anchor vs React Flow Top-Left Anchor
Dagre positions nodes at their center point. React Flow positions at top-left. You MUST subtract half width/height when converting:
```typescript
position: {
  x: dagreNode.x - nodeWidth / 2,
  y: dagreNode.y - nodeHeight / 2,
}
```
The official dagre example on reactflow.dev shows this explicitly.

### Pitfall 2: Empty Islands
If a pinned class has no edges to any other node, it forms a single-node island. Dagre handles this fine (one node = trivial layout), but ensure your island positioning logic handles `islandWidth = nodeWidth` correctly.

### Pitfall 3: Duplicate Nodes in Merged Graph
When ClassA and ClassC both inherit from ClassB, merging their hierarchies creates duplicate ClassB entries. Deduplicate by ID:
```typescript
function mergeGraphs(existing: CodeGraph | null, incoming: CodeGraph): CodeGraph {
  const nodeMap = new Map<string, CodeSymbol>()
  const edgeMap = new Map<string, SymbolEdge>()
  for (const n of existing?.nodes ?? []) nodeMap.set(n.id, n)
  for (const n of incoming.nodes) nodeMap.set(n.id, n)
  for (const e of existing?.edges ?? []) edgeMap.set(e.id, e)
  for (const e of incoming.edges) edgeMap.set(e.id, e)
  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] }
}
```

### Pitfall 4: Infinite Re-render Loop
If layout computation triggers a state update that triggers layout computation... Use `useMemo` for layout, not `useEffect`. The layout function should be a pure computation from inputs, not a side effect.

### Pitfall 5: Handle Positions After Layout
With dagre TB layout, source handles should be at `Position.Bottom` and target handles at `Position.Top`. For UsesType edges going right, you'd ideally use `Position.Right` source and `Position.Left` target. **However**, mixing handle positions per-edge is complex. Keep Top/Bottom handles and use `smoothstep` edge type — it routes around nodes reasonably well.

---

## 16. Implementation Order

1. **Add `@dagrejs/dagre` dependency** — `npm install @dagrejs/dagre && npm install -D @types/dagre`
2. **Create `src/utils/graphLayout.ts`** — island detection + dagre layout + island positioning (pure functions, no React)
3. **Extend store** — add `pinnedClassIds`, `pinnedClasses`, `multiGraph`, `pinClass`/`unpinClass` actions
4. **Refactor `buildFlowElements`** → call `graphLayout.ts` functions instead of manual positioning
5. **Update `GraphView`** — switch to controlled mode, add fitView animation
6. **Add pin/unpin UI** — Ctrl+click to pin, close button on pinned nodes
7. **Style focused class** — CSS glow on the active pinned class
8. **Test with 2, 5, 10 pinned classes** — verify layout quality and performance

---

## 17. Sources

| Source | Type | Confidence |
|--------|------|------------|
| https://reactflow.dev/learn/layouting/layouting | Official docs | HIGH |
| https://reactflow.dev/examples/layout/dagre | Official example with code | HIGH |
| https://reactflow.dev/examples/layout/elkjs | Official example with code | HIGH |
| https://reactflow.dev/learn/layouting/sub-flows | Official docs | HIGH |
| https://reactflow.dev/learn/advanced-use/performance | Official docs | HIGH |
| Current `GraphView.tsx` source (398 lines) | Codebase | HIGH |
| Current `appStore.ts` source (264 lines) | Codebase | HIGH |
| `@xyflow/react` v12.10.1 in `package.json` | Codebase | HIGH |
| Dagre docs (wiki on GitHub) | Official dagre docs | HIGH |
| Connected components algorithm | CS fundamentals | HIGH |
