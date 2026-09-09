# Phase 9: Progressive Rendering Specification

## Overview

This document specifies the progressive rendering pipeline that delivers smooth 60fps interactions for large merged graphs (300+ nodes) through priority-based disclosure and level-of-detail strategies.

## Priority System

### Priority Levels

| Priority | Trigger Condition | LOD Level | Render Deadline | Target % of Nodes |
|----------|-------------------|-----------|-----------------|-------------------|
| Immediate | In viewport + 20% padding | 0 (full) | ≤300ms | ~15-25% |
| Deferred | Direct neighbors (depth=1) | 1 (simplified) | ≤500ms | ~25-35% |
| Background | Distant nodes | 2 (minimal) | On-demand | ~40-60% |

### Priority Computation Algorithm

```typescript
computePriorities(nodes, edges, viewport):
  paddedViewport = expandViewport(viewport, 0.2)
  
  // Priority 1: Frustum cull to visible area
  immediate = nodes.filter(n => isInViewport(n, paddedViewport))
                    .slice(0, maxImmediateNodes)
  
  // Priority 2: Find neighbors of immediate nodes
  neighborIds = new Set()
  for edge in edges:
    if edge.source in immediateIds: neighborIds.add(edge.target)
    if edge.target in immediateIds: neighborIds.add(edge.source)
  
  deferred = nodes.filter(n => n.id in neighborIds && n.id not in immediateIds)
  
  // Priority 3: Everything else
  background = nodes.filter(n => n.id not in immediateIds and n.id not in neighborIds)
  
  return {immediate, deferred, background}
```

## Level of Detail (LOD) Strategies

### LOD 0: Full Detail
**Applied to**: Immediate priority nodes
**Rendering**:
- Full node shape (rounded rectangle)
- Label with full text (truncated at 50 chars)
- Entity type color coding
- Relation count badge
- Confidence indicator
- Evidence highlight overlays

### LOD 1: Simplified
**Applied to**: Deferred priority nodes
**Rendering**:
- Simple circle/ellipse shape
- Abbreviated label (20 chars max)
- Entity type color only
- No badges or indicators

### LOD 2: Minimal
**Applied to**: Background priority nodes
**Rendering**:
- Small dot (8px diameter)
- No label
- Generic gray color
- No interaction except on hover

### LOD Transition Rules

| Distance from Center | Zoom Level | LOD |
|---------------------|------------|-----|
| <50% of viewport radius | Any | 0 |
| 50-80% of viewport radius | Any | 1 |
| >80% of viewport radius | Any | 2 |
| Any distance | <0.5x | 2 |
| Any distance | >2.0x | 0 |

## Main Thread Budgeting

### Frame Time Allocation

**Budget**: 8ms per frame (leaves 8ms for browser/GC at 60fps)

| Task | Budget | Overflow Action |
|------|--------|-----------------|
| Layout computation | 3ms | Defer to next frame |
| Node rendering | 3ms | Drop to lower LOD |
| Edge rendering | 1ms | Simplify to straight lines |
| Event handling | 1ms | Queue non-critical |

### Work Scheduling Protocol

```typescript
scheduleDeferredWork(workFn):
  pendingWork.push(workFn)
  
  if hasIdleCallback:
    requestIdleCallback(processPendingWork, {timeout: 500})
  else:
    setTimeout(() => processPendingWork(), 10)

processPendingWork(deadline):
  while pendingWork.length > 0 AND deadline.timeRemaining() > frameTimeBudget:
    work = pendingWork.shift()
    work()
  
  if pendingWork.length > 0:
    scheduleDeferredWork(/* continue processing */)
```

## Frustum Culling Implementation

### Viewport Expansion

```typescript
expandViewport(viewport, paddingPercent):
  padX = viewport.width * paddingPercent
  padY = viewport.height * paddingPercent
  
  return {
    x: viewport.x - padX,
    y: viewport.y - padY,
    width: viewport.width + (padX * 2),
    height: viewport.height + (padY * 2),
    zoom: viewport.zoom
  }
```

### Point-in-Viewport Test

```typescript
isInViewport(node, viewport):
  centerX = node.x + node.width / 2
  centerY = node.y + node.height / 2
  
  return (
    centerX >= viewport.x AND
    centerX <= viewport.x + viewport.width AND
    centerY >= viewport.y AND
    centerY <= viewport.y + viewport.height
  )
```

## Neighbor Discovery Algorithm

### BFS Traversal

```typescript
getNeighbors(startNodes, edges, depth):
  result = new Map()
  visited = new Set()
  currentLevel = startNodes
  
  for d from 0 to depth-1:
    nextLevel = []
    
    for node in currentLevel:
      if node.id in visited: continue
      visited.add(node.id)
      result.set(node.id, node)
      
      for edge in edges:
        if edge.source == node.id:
          neighbor = findNodeById(edge.target)
        else if edge.target == node.id:
          neighbor = findNodeById(edge.source)
        
        if neighbor AND neighbor.id not in visited:
          nextLevel.push(neighbor)
    
    currentLevel = nextLevel
  
  return values(result)
```

## Animation Protocols

### LOD Transitions

**Technique**: CSS opacity fade (150ms)
**Easing**: `ease-out`
**Trigger**: IntersectionObserver or manual zoom/pan event

```css
.node-lod-transition {
  transition: opacity 150ms ease-out;
}

.node-lod-0 { opacity: 1; }
.node-lod-1 { opacity: 0.85; }
.node-lod-2 { opacity: 0.6; }
```

### Progressive Disclosure

**Sequence**:
1. T+0ms: Render immediate nodes (LOD 0)
2. T+50ms: Begin deferred node fade-in (LOD 1)
3. T+500ms: Complete deferred rendering
4. T+500ms+: Background nodes on demand

## Responsive Breakpoints

| Viewport Width | Max Immediate Nodes | Padding % | LOD Thresholds |
|----------------|---------------------|-----------|----------------|
| <375px (mobile) | 50 | 0.3 | 40%/70% |
| 375-768px (tablet) | 75 | 0.25 | 45%/75% |
| 768-1440px (desktop) | 100 | 0.2 | 50%/80% |
| >1440px (ultrawide) | 150 | 0.15 | 55%/85% |

## Accessibility Considerations

### Reduced Motion

When `prefers-reduced-motion: reduced`:
- Disable LOD transition animations
- Render all visible nodes at highest LOD immediately
- Skip progressive disclosure, render in single batch

### Screen Reader Support

```html
<div role="img" aria-label="Knowledge graph with 150 nodes">
  <div class="sr-only">
    Showing {{immediateCount}} of {{totalCount}} concepts.
    Use arrow keys to navigate between nodes.
    Press Enter to view details.
  </div>
  <!-- Canvas rendering -->
</div>
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Next node (in reading order) |
| Shift+Tab | Previous node |
| Arrow keys | Pan viewport |
| +/- | Zoom in/out |
| Enter | Open evidence panel |
| Escape | Close panel, focus graph |

## Performance Monitoring

### Metrics to Track

| Metric | Collection Method | Alert Threshold |
|--------|-------------------|-----------------|
| Frame time p95 | Performance API | >16ms |
| LOD switch frequency | Custom instrumentation | >10/min |
| Deferred work queue depth | Internal counter | >100 items |
| Main thread blocking | Long Task API | >50ms |

### Debugging Tools

```typescript
// Enable debug mode
renderer.debug = {
  showPriorityBoundaries: true, // Color-code by priority
  showFrameTiming: true, // Overlay fps counter
  logDeferredWork: true // Console.log work items
};
```

## Related Documents

- [Caching Architecture Spec](./caching-architecture-spec.md)
- [Bundle Optimization Spec](./bundle-optimization-spec.md)
- [Performance Runbook](./performance-runbook.md)
- [Handoff to Phase 10](./handoff-to-phase-10.md)
