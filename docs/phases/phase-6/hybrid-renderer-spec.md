# Hybrid Graph Renderer Specification

## Component Overview

`HybridGraphRenderer.tsx` is the primary React component for visualizing knowledge graphs with three interchangeable display modes.

## Props Interface

```typescript
interface HybridGraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paperId?: string;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  initialMode?: GraphMode;
}
```

## Display Modes

### Hierarchical Mode (Default)
- **Algorithm**: Dagre hierarchical layout
- **Direction**: Top-to-bottom (TB)
- **Use Case**: Understanding methodology flow, evidence provenance
- **Visual Characteristics**:
  - Nodes grouped by section level
  - Parent-child relationships visible
  - Minimal edge crossings

### Clustered Mode
- **Algorithm**: ELK layered with compound nodes
- **Direction**: Left-to-right (LR)
- **Use Case**: Semantic grouping, cross-section connections
- **Visual Characteristics**:
  - Entities of same type grouped
  - Compound nodes for sections
  - Orthogonal edge routing

### Exploratory Mode
- **Algorithm**: Constrained force-directed
- **Seeding**: Deterministic positions from hierarchical layout
- **Use Case**: Manual rearrangement, exploration
- **Visual Characteristics**:
  - User can drag nodes
  - Auto-stabilizes after interaction
  - Bounded simulation area

## Accessibility Features

| Feature | Implementation |
|---------|----------------|
| Keyboard Navigation | Tab/Arrow keys between nodes |
| ARIA Labels | `aria-label="${type}: ${label}"` |
| Screen Reader | Live region for selections |
| High Contrast | WCAG AA compliant colors |
| Reduced Motion | Respects `prefers-reduced-motion` |

## Color Scheme

### Node Colors by Type
- concept: `#60A5FA` (blue)
- method: `#34D399` (green)
- dataset: `#F472B6` (pink)
- model: `#A78BFA` (purple)
- author: `#FBBF24` (amber)
- institution: `#FB923C` (orange)
- claim: `#EF4444` (red)
- result: `#10B981` (emerald)
- limitation: `#6B7280` (gray)

### Edge Styles
- **Explicit relations** (`isExplicitlyStated: true`): Solid line, 2px width
- **Co-occurrence** (`isExplicitlyStated: false`): Dashed line (4,4), 1px width

## State Management

```typescript
const [mode, setMode] = useState<GraphMode>(initialMode);
const [layout, setLayout] = useState<LayoutResult | null>(null);
const [viewport, setViewport] = useState<ViewportMetrics>({...});
const [selectedNode, setSelectedNode] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(true);
```

### Persistence
Mode preference stored in localStorage:
```typescript
localStorage.setItem(`graph-mode-${paperId}`, mode);
```

## Performance Optimizations

1. **React.useMemo** for node/edge rendering
2. **React.useCallback** for event handlers
3. **Debounced viewport observer** (150ms)
4. **Early cancellation** on unmount
5. **CSS transforms** for animations (GPU accelerated)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| M | Toggle mode (hierarchical → clustered → exploratory) |
| F | Toggle fullscreen |
| Enter | Activate selected node |
| Escape | Deselect node |

## Events

### onNodeClick
```typescript
(node: GraphNode) => void
```
Triggered when user clicks or presses Enter on a node.

### onEdgeClick
```typescript
(edge: GraphEdge) => void
```
Reserved for future edge interaction support.

## Error Handling

- Layout computation failures logged to console
- Fallback to grid layout if ELK unavailable
- Graceful degradation if fullscreen not supported
- Loading spinner during async operations

## Testing Checklist

- [ ] All three modes render correctly
- [ ] Mode persists across page reloads
- [ ] Keyboard navigation reaches all nodes
- [ ] ARIA labels announced by screen reader
- [ ] Colors pass WCAG AA contrast
- [ ] Reduced motion preference respected
- [ ] Fullscreen toggle works on desktop/mobile
- [ ] Resize handling smooth (no jank)
- [ ] Memory stable during extended interaction
