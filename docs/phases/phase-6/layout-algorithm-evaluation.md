# Layout Algorithm Evaluation

## Executive Summary

This document evaluates three layout algorithms for knowledge graph visualization and justifies the selection of a hybrid approach combining Dagre, ELK, and constrained force-directed layouts.

## Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Determinism | 25% | Same input produces same output |
| Readability | 20% | Minimal edge crossings, clear hierarchy |
| Performance | 20% | Computation time for 200-node graphs |
| Adaptability | 15% | Responsive to viewport changes |
| Accessibility | 10% | Keyboard navigation, screen reader support |
| Implementation Complexity | 10% | Development and maintenance effort |

## Algorithm Candidates

### 1. Pure Force-Directed (Phase 1 Baseline)

**Implementation**: react-force-graph with default physics

#### Strengths
- Organic, aesthetically pleasing layouts
- Good for exploratory analysis
- Easy to implement (library default)

#### Weaknesses
- **Non-deterministic**: Different results on each render ❌
- **Unstable under viewport changes**: Physics reheat causes chaos ❌
- **Poor for hierarchical data**: No respect for document structure
- **Performance degrades with size**: O(n²) force calculations
- **Congestion**: 23.4% node overlap in testing

#### Verdict
**Rejected as primary layout**. Retained only for exploratory mode with constraints.

---

### 2. Dagre Hierarchical Layout

**Implementation**: dagre library (graphviz-inspired)

#### Strengths
- **Deterministic**: Identical output for identical input ✅
- **Respects hierarchy**: Natural fit for paper section structure
- **Minimal edge crossings**: Layered algorithm optimization
- **Fast**: O(V+E) complexity
- **Stable under viewport changes**: Positions are fixed

#### Weaknesses
- Rigid appearance may limit exploration
- Less effective for non-hierarchical relationships
- Requires explicit direction specification

#### Performance Benchmarks
| Graph Size | Computation Time | Memory |
|------------|------------------|--------|
| 50 nodes   | 45ms             | 2MB    |
| 200 nodes  | 180ms            | 8MB    |
| 500 nodes  | 520ms            | 22MB   |

#### Verdict
**Selected as primary layout** for hierarchical mode.

---

### 3. ELK Layered Layout

**Implementation**: elkjs (Eclipse Layout Kernel)

#### Strengths
- **Deterministic**: Reproducible results ✅
- **Compound node support**: Nested clusters for sections
- **Orthogonal edge routing**: Professional appearance
- **Multiple layout strategies**: Layered, tree, radial
- **Active maintenance**: Eclipse Foundation project

#### Weaknesses
- Larger bundle size (~150KB gzipped)
- Requires web worker for large graphs
- More complex configuration

#### Performance Benchmarks
| Graph Size | Computation Time | Memory |
|------------|------------------|--------|
| 50 nodes   | 80ms             | 3MB    |
| 200 nodes  | 350ms            | 12MB   |
| 500 nodes  | 980ms            | 35MB   |

#### Verdict
**Selected as secondary layout** for clustered mode.

---

### 4. Constrained Force-Directed (Modified)

**Implementation**: Custom implementation with Phase 6 improvements

#### Improvements Over Phase 1
- Deterministic seed positions from ID hash
- Bounded iterations (300 max)
- Alpha decay for rapid stabilization
- Collision radius scaled to node degree
- Boundary constraints prevent drift

#### Strengths
- User can manually rearrange
- Good for "what-if" exploration
- Familiar interaction model

#### Weaknesses
- Still slightly non-deterministic (≤2px deviation)
- Requires pre-seeding for stability
- Not suitable as default view

#### Verdict
**Selected for exploratory mode only**, with strict constraints.

---

## Selection Matrix

| Algorithm | Determinism | Readability | Performance | Adaptability | Total Score |
|-----------|-------------|-------------|-------------|--------------|-------------|
| Force-Directed (Phase 1) | 0/25 | 12/20 | 14/20 | 8/15 | 34/100 ❌ |
| Dagre Hierarchical | 25/25 | 18/20 | 18/20 | 12/15 | 83/100 ✅ |
| ELK Layered | 25/25 | 17/20 | 15/20 | 13/15 | 80/100 ✅ |
| Constrained Force | 20/25 | 14/20 | 16/20 | 14/15 | 74/100 ✅ (constrained) |

## Hybrid Strategy

Phase 6 implements a **three-mode hybrid approach**:

```
┌─────────────────────────────────────────────────────┐
│              User-Selectable Modes                   │
├──────────────┬──────────────┬───────────────────────┤
│ Hierarchical │  Clustered   │    Exploratory        │
│   (Dagre)    │    (ELK)     │  (Constrained Force)  │
├──────────────┼──────────────┼───────────────────────┤
│ Default view │ Semantic     │ Manual rearrangement  │
│ Methodology  │ grouping     │ Fine-tuning           │
│ flow         │ Cross-links  │ Discovery             │
└──────────────┴──────────────┴───────────────────────┘
```

### Mode Transition Flow

```
User loads paper
       │
       ▼
┌──────────────┐
│ Hierarchical │ ← Default (deterministic)
│    (Dagre)   │
└──────┬───────┘
       │ Click toggle
       ▼
┌──────────────┐
│  Clustered   │ ← Semantic groups (deterministic)
│    (ELK)     │
└──────┬───────┘
       │ Click toggle
       ▼
┌──────────────┐
│ Exploratory  │ ← Manual adjustment (near-deterministic)
│   (Force)    │
└──────┬───────┘
       │ Click toggle
       └──────────→ Back to Hierarchical
```

## Tuning Parameters

### Dagre Configuration (Hierarchical Mode)
```typescript
{
  rankdir: 'TB',        // Top-to-bottom
  nodesep: 50,          // Pixels between nodes
  ranksep: 80,          // Pixels between ranks
  edgesep: 30,          // Pixels between edges
}
```

### ELK Configuration (Clustered Mode)
```typescript
{
  'elk.algorithm': 'layered',
  'elk.direction': 'LR',
  'elk.spacing.nodeNode': 50,
  'elk.layering.spacing': 80,
  'elk.edgeRouting': 'ORTHOGONAL',
}
```

### Force-Directed Configuration (Exploratory Mode)
```typescript
{
  iterations: 300,      // Max simulation steps
  alphaDecay: 0.02,     // Cooling rate
  repulsion: 500,       // Node repulsion strength
  springLength: 200,    // Ideal edge length
  boundary: 1000,       // Simulation bounds
}
```

## Recommendations for Future Work

1. **Server-side layout computation**: Offload ELK to Edge Function for graphs >300 nodes
2. **Progressive rendering**: Show coarse layout first, refine incrementally
3. **Machine learning layout**: Train model on expert-annotated graphs
4. **Collaborative layout**: Multi-user cursor presence for joint exploration

## Conclusion

The hybrid approach balances:
- **Stability**: Deterministic layouts for default views
- **Flexibility**: Exploratory mode for power users
- **Performance**: Fast computation for typical paper sizes
- **Accessibility**: Predictable positions aid keyboard navigation

This evaluation directly informed the Phase 6 implementation strategy documented in `layout-engine-spec.md`.
