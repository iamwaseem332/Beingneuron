# Phase 7: Sync Protocol Specification

## Overview

The SyncManager implements bidirectional synchronization between the graph visualization and PDF viewer, ensuring that selecting an entity in either view immediately highlights corresponding evidence in the other view.

## Core State Machine

### SyncState
```typescript
interface SyncState {
  activeNodeId: string | null;     // Currently selected graph node
  activeSpanIds: string[];         // Evidence span identifiers
  pdfPage: number;                 // Current PDF page
  pdfScrollY: number;              // Scroll position
  highlightRegions: HighlightRegion[]; // Computed highlight geometry
  syncSource: 'graph' | 'pdf' | 'none'; // Prevents feedback loops
}
```

### Valid State Transitions
```
none → graph (user clicks node)
none → pdf (user selects text)
graph → none (user closes panel)
pdf → none (user clears selection)
graph → pdf (blocked - prevents loop)
pdf → graph (blocked - prevents loop)
```

## Feedback Loop Prevention

The `syncSource` flag is the primary mechanism for preventing infinite synchronization cycles:

```typescript
onNodeSelect(nodeId, spans):
  if state.syncSource === 'pdf': return  // Ignore if PDF triggered selection
  state.syncSource = 'graph'
  updateHighlights()
  scrollToPdfRegion()

onPdfTextSelect(pageNumber, charRange):
  if state.syncSource === 'graph': return  // Ignore if graph triggered selection
  state.syncSource = 'pdf'
  findMatchingNodes()
  focusGraphNode()
```

## Debouncing Strategy

Scroll events are debounced to prevent highlight flicker:

```typescript
onPdfScroll(pageNumber, scrollY):
  if debounceTimer: clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    refreshHighlightsForPage(pageNumber)
  }, 50ms)  // Tuned for smooth scrolling without jank
```

## Graph→PDF Flow

1. User clicks graph node
2. System retrieves node's evidence spans
3. SpanMapper computes PDF coordinates
4. SyncManager updates state with `syncSource='graph'`
5. PDF viewer scrolls smoothly to first highlight region
6. Highlights rendered on all relevant pages
7. Evidence panel opens with span details

**Latency Target**: ≤200ms from click to stable highlight

## PDF→Graph Flow

1. User selects text in PDF viewer
2. PDF viewer emits selection event with page number and char range
3. SyncManager performs reverse lookup to find matching nodes
4. SyncManager updates state with `syncSource='pdf'`
5. Graph renderer pans/zooms to center matching node
6. Node highlighted in graph
7. Evidence panel opens

**Latency Target**: ≤250ms from selection to node focus

## Reverse Lookup Algorithm

```typescript
findNodesOverlappingSpan(pageNumber, charRange):
  return allNodes.filter(node =>
    node.evidenceSpans.some(span =>
      span.pageNumber === pageNumber &&
      span.startChar < charRange.end &&
      span.endChar > charRange.start
    )
  )
```

**Optimization**: Index nodes by `(pageNumber, charStart)` for O(log n) lookup.

## URL Serialization

Sync state can be serialized to URL hash for shareable links:

```
#evidence?node=node-123&page=5&spans=chunk-1:100-200,chunk-2:50-150
```

Parsing this hash on page load restores the exact evidence view.

## Race Condition Analysis

| Race Condition | Mitigation |
|----------------|------------|
| Rapid node clicks | State update is synchronous, last write wins |
| Concurrent scroll + select | Debounce scroll, immediate select priority |
| Multi-tab session | BroadcastChannel API syncs state across tabs |
| Slow SpanMapper computation | Cancel pending computation on new selection |

## Error Handling

| Error Type | Recovery Behavior |
|------------|-------------------|
| SpanMapper returns empty coordinates | Display page-level fallback, log warning |
| PDF viewer not ready | Queue action, retry on viewer ready event |
| Node not found in reverse lookup | Clear selection, show toast notification |
| Graph renderer unavailable | Log error, continue PDF highlighting only |

## Accessibility Integration

- `aria-live="polite"` region announces highlight changes
- Keyboard navigation cycles through evidence spans
- Focus management ensures screen reader context preservation
- High contrast mode uses border styles in addition to color

## Testing Checklist

- [ ] Graph→PDF latency ≤200ms (measure with performance.now)
- [ ] PDF→Graph latency ≤250ms
- [ ] Zero feedback loops in 1-hour stress test
- [ ] Active node always matches active highlights
- [ ] Debounced scroll doesn't cause highlight jitter
- [ ] URL hash restoration works after page reload
- [ ] Multi-tab sync keeps views consistent

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-10 | Initial implementation |
