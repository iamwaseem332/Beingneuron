# Viewport Adaptation Specification

## Overview

This document specifies the responsive viewport adaptation system that ensures stable graph rendering across all device sizes without triggering physics instabilities.

## Core Principles

1. **Scale pre-computed positions, not physics parameters** - Eliminates simulation instability
2. **Fullscreen triggers layout recomputation with spacing multiplier** - Not force reheat
3. **CSS transform animation for transitions** - Jank-free experience
4. **Debounced ResizeObserver (150ms)** - Prevents layout thrashing
5. **Minimum readable font size (12px)** - Enforced regardless of scale

## Viewport Metrics Interface

```typescript
interface ViewportMetrics {
  width: number;           // Window innerWidth
  height: number;          // Window innerHeight
  isFullscreen: boolean;   // Fullscreen element active
  devicePixelRatio: number; // window.devicePixelRatio
}
```

## Scaling Algorithm

### Calculate Scale Factor

```typescript
function calculateScaleFactor(bounds, viewport, config): number {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  
  if (contentWidth === 0 || contentHeight === 0) return 1;
  
  const availableWidth = viewport.width - config.padding * 2;
  const availableHeight = viewport.height - config.padding * 2;
  
  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  
  return Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x
}
```

### Apply Scaling

```typescript
function adaptLayoutToViewport(baseLayout, viewport, config): LayoutResult {
  const scaleFactor = calculateScaleFactor(baseLayout.bounds, viewport, config);
  
  const adaptedNodes = baseLayout.nodes.map(node => ({
    ...node,
    x: node.x * scaleFactor,
    y: node.y * scaleFactor,
    width: node.width * scaleFactor,
    height: node.height * scaleFactor,
  }));
  
  return {
    ...baseLayout,
    nodes: adaptedNodes,
    bounds: scaleBounds(baseLayout.bounds, scaleFactor),
    computedAt: new Date().toISOString(),
  };
}
```

## Responsive Breakpoints

| Device Class | Width Range | Default Scale | Spacing Multiplier |
|--------------|-------------|---------------|-------------------|
| Mobile       | 375-480px   | 0.8-1.0       | 1.0               |
| Tablet       | 768-1024px  | 1.0-1.2       | 1.1               |
| Desktop      | 1280-1920px | 1.0-1.3       | 1.2               |
| Ultrawide    | 2560-3440px | 1.2-1.5       | 1.4 (fullscreen)  |

## Fullscreen Transition Protocol

### Entry Sequence
1. User clicks fullscreen button or presses 'F'
2. `requestFullscreen()` called on container element
3. `fullscreenchange` event fires
4. Viewport observer detects size change (debounced 150ms)
5. Layout recomputed with `spacingMultiplier: 1.4`
6. CSS transform animates to new positions (300ms)
7. State preserved: zoom level, pan offset, selected node

### Exit Sequence
1. User exits fullscreen (Esc or button)
2. `exitFullscreen()` called
3. `fullscreenchange` event fires
4. Viewport observer detects size change (debounced 150ms)
5. Layout recomputed with `spacingMultiplier: 1.0`
6. CSS transform animates to new positions (300ms)

## Animation Timing

```css
.graph-node {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .graph-node {
    transition: none;
  }
}
```

## Font Size Enforcement

```typescript
function getMinimumFontSize(baseSize: number, scaleFactor: number): number {
  const minSize = 12; // Absolute minimum in pixels
  const scaledSize = baseSize * scaleFactor;
  return Math.max(scaledSize, minSize);
}
```

## ResizeObserver Implementation

```typescript
const resizeObserver = new ResizeObserver(debouncedUpdate);
resizeObserver.observe(document.body);

function debouncedUpdate() {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(updateMetrics, 150); // 150ms debounce
}
```

## Device Pixel Ratio Handling

High-DPI displays (Retina, etc.) require special handling:

```typescript
const svg = document.querySelector('svg');
svg.setAttribute('width', `${viewport.width * devicePixelRatio}px`);
svg.setAttribute('height', `${viewport.height * devicePixelRatio}px`);
```

## Testing Matrix

| Test Case | Viewport | Expected Behavior |
|-----------|----------|-------------------|
| Mobile portrait | 375x667 | Scale fits width, labels truncated |
| Mobile landscape | 667x375 | Scale fits height, mode toggle accessible |
| Tablet | 768x1024 | Default scale, full labels visible |
| Desktop | 1440x900 | Optimal spacing, all details visible |
| Ultrawide | 3440x1440 | Max scale 1.5x, expanded spacing |
| Fullscreen desktop | 1920x1080 | 1.4x spacing multiplier |
| Fullscreen ultrawide | 3440x1440 | 1.4x spacing, centered content |
| Reduced motion | Any | Instant transitions, no animation |

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Resize recovery time | ≤300ms | From resize end to stable render |
| Fullscreen transition | ≤350ms | From click to stable layout |
| Frame rate during transition | ≥55fps | Chrome DevTools FPS meter |
| Layout thrashing | 0 | No forced synchronous layouts |
| Memory delta after resize | ≤5MB | Heap snapshot comparison |

## Edge Cases Handled

1. **Zero-dimension viewport**: Return scale factor 1.0
2. **Extremely small viewport (<320px)**: Maintain 12px minimum font
3. **Extremely large viewport (>4K)**: Cap scale at 1.5x
4. **Rapid resize events**: Debounce prevents excessive computation
5. **Fullscreen API unavailable**: Graceful degradation, button hidden
6. **Orientation change**: Treated as resize, layout recomputed
