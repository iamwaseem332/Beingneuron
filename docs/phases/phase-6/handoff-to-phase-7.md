# Phase 6 to Phase 7 Handoff Document

## Overview

This document defines the interface contracts and integration points between Phase 6 (Deterministic Graph Layout Engine) and Phase 7 (Evidence Linking System).

## Component API for Evidence Linking

### HybridGraphRenderer Props

```typescript
interface HybridGraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paperId?: string;
  onNodeClick?: (node: GraphNode) => void;  // Phase 7 integration point
  onEdgeClick?: (edge: GraphEdge) => void;
  initialMode?: GraphMode;
}
```

### Node Click Event Payload

When a user clicks a node, Phase 7 receives:

```typescript
interface NodeClickEvent {
  nodeId: string;
  entityType: EntityType;
  normalizedForm: string;
  evidenceSpans: EvidenceSpan[];
  sectionContext?: string;
  confidence: number;
}
```

## Layout Cache Invalidation Hooks

### Cache Key Structure

```typescript
const cacheKey = `${paperId}:${extractionVersion}:${layoutConfigHash}`;
```

### Invalidation Triggers

Phase 7 should trigger cache invalidation when:
1. New extraction results arrive (via Realtime subscription)
2. User manually refreshes extraction
3. Schema version changes

### Invalidation API

```typescript
// From src/lib/graph/layouts/cache.ts
export function invalidateLayoutCache(paperId: string): void;
export function invalidateAllCaches(): void;
```

## Performance Budgets for Phase 7 Features

| Feature | Budget | Measurement |
|---------|--------|-------------|
| Evidence panel open latency | ≤200ms | Click to visible |
| Span highlight render time | ≤50ms | Data to DOM |
| PDF scroll sync latency | ≤100ms | Graph click to PDF scroll |
| Additional memory per highlight | ≤2MB | Heap delta |
| Total bundle size increase | ≤50KB | Gzipped |

## Stable Node Positions for Span Highlighting

Phase 7 can rely on:
- **Deterministic positions**: Same input → same output (0px deviation for hierarchical/clustered)
- **Persistent coordinates**: Positions stable across page reloads (cached)
- **Viewport-adapted scaling**: Positions automatically adjust to screen size

### Position Query API

```typescript
// Get current node position
const position = renderer.getNodePosition(nodeId);

// Subscribe to position changes
renderer.onPositionChange((nodeId, newPosition) => {
  updateHighlightPosition(nodeId, newPosition);
});
```

## Evidence Panel Integration

### Placement Algorithm

Phase 7 should position evidence panels:
1. Adjacent to selected node (not overlapping)
2. Within viewport bounds (auto-scroll if needed)
3. Connected by leader line to node

### Panel Content Requirements

```typescript
interface EvidencePanelData {
  entity: ExtractedEntity;
  relations: ExtractedRelation[];
  evidenceSpans: Array<{
    excerpt: string;
    pageNumber: number;
    startChar: number;
    endChar: number;
    confidence: number;
  }>;
}
```

## PDF Viewer Synchronization

### Scroll-to-Span API

```typescript
// Phase 7 calls this when user clicks evidence span
scrollToSpan(span: EvidenceSpan): Promise<void>;
```

### Highlight Overlay API

```typescript
// Phase 6 provides node bounding box
const bbox = renderer.getNodeBoundingBox(nodeId);
// Phase 7 draws connection line from bbox to PDF highlight
```

## Realtime Subscription Setup

Phase 7 should subscribe to:

```typescript
// Supabase Realtime channel
const channel = supabase
  .channel(`graph-updates:${paperId}`)
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'extracted_entities' },
    (payload) => {
      // Invalidate cache and re-render
      invalidateLayoutCache(paperId);
    }
  )
  .subscribe();
```

## Error Handling Contract

| Error Type | Phase 6 Behavior | Phase 7 Expected Action |
|------------|------------------|------------------------|
| Layout computation failure | Log error, use fallback | Show degraded UI, allow retry |
| Cache miss | Compute fresh layout | Display loading state |
| Viewport observer failure | Use static dimensions | Disable responsive features |
| Fullscreen API unavailable | Hide fullscreen button | No action needed |

## Testing Integration Points

### Joint Test Cases

1. **Node click → Evidence panel opens**
   - Latency ≤200ms
   - Panel positioned correctly
   - ARIA announcement triggered

2. **Evidence span click → PDF scrolls**
   - Latency ≤100ms
   - Correct page and position
   - Highlight visible

3. **Extraction update → Graph refreshes**
   - Cache invalidated
   - New layout computed
   - Evidence panel updates

### Test Commands

```bash
# Run Phase 6 tests
npm run test:phase-6

# Run Phase 7 integration tests (when available)
npm run test:phase-7:integration

# Run end-to-end tests
npm run test:e2e:graph-evidence-flow
```

## Known Limitations

1. **Large graphs (>500 nodes)**: Evidence panel may cause layout shift; consider collapsible panel
2. **Mobile viewports**: Limited space for simultaneous graph + evidence + PDF; consider tabbed interface
3. **Low-motion preference**: Some visual feedback disabled; ensure alternative cues exist

## Recommended Batch Sizes

For optimal performance when loading evidence data:

| Graph Size | Max Evidence Spans per Render | Debounce Interval |
|------------|------------------------------|-------------------|
| <50 nodes  | 20                           | 0ms (immediate)   |
| 50-200 nodes | 10                         | 50ms              |
| >200 nodes | 5                            | 100ms             |

## Sign-off Checklist

- [ ] Phase 6 lead confirms stable node position API
- [ ] Phase 7 lead confirms evidence panel requirements met
- [ ] Joint integration test plan reviewed
- [ ] Performance budgets agreed upon
- [ ] Error handling contract documented
- [ ] Realtime subscription pattern validated
- [ ] Accessibility review completed for combined UX

**Handoff Date**: $(date +%Y-%m-%d)  
**Phase 6 Lead**: [Name]  
**Phase 7 Lead**: [Name]  
**Status**: Ready for Phase 7 development
