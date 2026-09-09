# Phase 7: Evidence Panel Specification

## Overview

The EvidencePanel component provides a contextual sidebar displaying entity metadata, relations, and evidence spans with navigation controls when a graph node is selected or PDF text is highlighted.

## Component API

### Props
```typescript
interface EvidencePanelProps {
  nodeId: string;                    // Unique identifier for the node
  entityType: string;                // Type from Phase 4 schema (concept, method, etc.)
  normalizedForm: string;            // Canonical name for display
  relations: Array<{                 // Relations from extraction
    type: string;
    targetId: string;
    targetType?: string;
  }>;
  evidenceSpans: TextSpan[];         // Evidence spans from Phase 4
  confidence: number;                // Overall confidence 0-1
  onClose: () => void;               // Callback to close panel
}
```

## Layout Structure

```
┌─────────────────────────────────────┐
│ [Entity Name]                  [×]  │ ← Header
│ Entity Type                         │
├─────────────────────────────────────┤
│ High Confidence (92%)               │ ← Confidence Banner
├─────────────────────────────────────┤
│ Relations                           │
│ • uses → method-456                 │
│ • evaluates_on → dataset-789        │
├─────────────────────────────────────┤
│ Evidence 1 of 3          [←] [→]   │ ← Navigation Header
├─────────────────────────────────────┤
│ Page 5                              │
│ ⚠️ Low confidence mapping           │
│ Chars 120–280                       │
│ [Copy Excerpt] [Report Issue]       │
├─────────────────────────────────────┤
│ ... additional evidence spans ...   │
├─────────────────────────────────────┤
│ [View Full Section]                 │ ← Footer Action
└─────────────────────────────────────┘
```

## Visual States

### Confidence Indicators

| Confidence Range | Color | Label | Visual Treatment |
|------------------|-------|-------|------------------|
| ≥0.9 | Green | "High Confidence" | Solid green background |
| 0.7–0.9 | Yellow | "Medium Confidence" | Solid yellow background |
| <0.7 | Red | "Low Confidence" | Red background + ⚠️ warning icon |

### Evidence Span States

| State | Border | Background | Additional Markers |
|-------|--------|------------|-------------------|
| Current | Blue, 2px | Blue-50 | None |
| Other | Gray, 2px | Gray-50 | None |
| Low Confidence | Red, dashed | Gray-50 | ⚠️ icon |

## Interaction Patterns

### Navigation Controls
- **Previous/Next buttons**: Cycle through evidence spans circularly
- **Keyboard shortcuts**: Alt+← / Alt+→ for navigation
- **Touch gestures**: Swipe left/right on mobile

### Contextual Actions
- **Copy Excerpt**: Copies formatted citation to clipboard
- **Report Issue**: Opens modal for flagging incorrect evidence
- **View Full Section**: Expands context beyond span boundaries

### Multi-Evidence Handling
When `evidenceSpans.length > 1`:
- Show "X of Y" indicator in header
- Display navigation arrows
- Only current evidence highlighted with blue border
- Previous/next accessible via keyboard and click

## Accessibility Features

### Screen Reader Support
```jsx
<div role="status" aria-live="polite" className="sr-only">
  Showing evidence 2 of 5
</div>
```

### Keyboard Navigation
| Key | Action |
|-----|--------|
| Tab | Focus next interactive element |
| Shift+Tab | Focus previous element |
| Alt+← | Previous evidence |
| Alt+→ | Next evidence |
| Escape | Close panel |
| Enter/Space | Activate focused button |

### ARIA Labels
- Panel: `aria-label="Evidence Panel"`
- Close button: `aria-label="Close evidence panel"`
- Evidence items: `aria-label="Evidence span on page X"`
- Navigation: `aria-label="Previous/Next evidence"`

### WCAG Compliance
- **Color Contrast**: All text meets AA (4.5:1 minimum)
- **Color Independence**: Borders and icons supplement color
- **Focus Indicators**: Visible focus rings on all interactive elements
- **Motion Sensitivity**: Respects `prefers-reduced-motion`

## Responsive Behavior

### Desktop (≥768px)
- Fixed right sidebar, 384px (24rem) width
- Full height, scrollable content area
- Collapsible via close button only

### Mobile (<768px)
- Bottom sheet overlay
- Full width, 60% height
- Swipe down to dismiss
- Larger touch targets (48px minimum)

## Performance Optimizations

### Memoization
```typescript
const EvidencePanel = memo(({ nodeId, evidenceSpans, ... }) => {
  // Expensive computations memoized
  const highlights = useMemo(
    () => evidenceSpans.map(span => computeHighlight(span)),
    [evidenceSpans]
  );
  
  return <aside>{/* render */}</aside>;
});
```

### Virtualization
For nodes with >20 evidence spans:
- Only render visible spans + 2 buffer
- Use `react-window` for efficient scrolling
- Lazy-load highlight geometry on scroll

### Render Optimization
- Highlights computed only for visible pages
- Geometry cached by span ID
- Re-render only on state changes, not scroll

## Integration Points

### SyncManager Connection
```typescript
// Panel receives updates via React Context
const { activeNodeId, highlightRegions } = useSyncContext();

// Panel triggers sync actions
syncManager.onNodeSelect(nodeId, evidenceSpans);
```

### PDF Viewer Integration
```typescript
// Panel commands PDF viewer to scroll
pdfViewer.scrollToRegion(highlightRegions[0], {
  behavior: 'smooth',
  block: 'center'
});
```

### Graph Renderer Integration
```typescript
// Panel commands graph to focus node
graphRenderer.focusNode(nodeId, { animate: true });
```

## Error States

| Error | Display | Recovery |
|-------|---------|----------|
| No evidence spans | "No evidence available" message | N/A |
| SpanMapper failure | Page-level fallback with warning | Retry on remount |
| Low confidence | ⚠️ icon + yellow highlight | User can report issue |
| Relations load failure | Empty relations section | Retry button |

## Testing Requirements

### Unit Tests
- [ ] Confidence color/label mapping correct
- [ ] Navigation cycles correctly (first→last, last→first)
- [ ] Copy excerpt formats correctly
- [ ] ARIA labels present on all interactive elements

### Integration Tests
- [ ] Panel opens on node click
- [ ] Panel closes on × button
- [ ] Navigation updates highlight geometry
- [ ] Keyboard shortcuts trigger actions

### Accessibility Tests
- [ ] Screen reader announces all content
- [ ] Full keyboard navigation works
- [ ] High contrast mode legible
- [ ] Reduced motion respected

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-10 | Initial implementation |
