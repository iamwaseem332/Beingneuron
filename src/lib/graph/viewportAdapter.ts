// src/lib/graph/viewportAdapter.ts
// Type augmentation for vendor-prefixed fullscreen properties
interface Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
}

export interface ViewportMetrics {
  width: number;
  height: number;
  isFullscreen: boolean;
  devicePixelRatio: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutResult {
  nodes: NodePosition[];
  edges: Array<{ source: string; target: string; points: Array<{x:number,y:number}> }>;
  bounds: Bounds;
  algorithm: string;
  computedAt: string;
}

interface LayoutConfig {
  nodeSpacing: number;
  rankSpacing: number;
  padding: number;
}

export function adaptLayoutToViewport(
  baseLayout: LayoutResult, 
  viewport: ViewportMetrics,
  config: LayoutConfig
): LayoutResult {
  const scaleFactor = calculateScaleFactor(baseLayout.bounds, viewport, config);
  
  const adaptedNodes = baseLayout.nodes.map(node => ({
    ...node,
    x: node.x * scaleFactor,
    y: node.y * scaleFactor,
    width: node.width * scaleFactor,
    height: node.height * scaleFactor,
  }));
  
  // Adjust spacing proportionally for fullscreen
  const spacingMultiplier = viewport.isFullscreen ? 1.4 : 1.0;
  
  return {
    ...baseLayout,
    nodes: adaptedNodes,
    bounds: scaleBounds(baseLayout.bounds, scaleFactor),
    computedAt: new Date().toISOString(),
  };
}

function calculateScaleFactor(bounds: Bounds, viewport: ViewportMetrics, config: LayoutConfig): number {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  
  if (contentWidth === 0 || contentHeight === 0) {
    return 1;
  }
  
  const availableWidth = viewport.width - config.padding * 2;
  const availableHeight = viewport.height - config.padding * 2;
  
  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  
  // Use the smaller scale to fit content, cap at 1.5 to prevent excessive zoom
  return Math.min(scaleX, scaleY, 1.5);
}

export function scaleBounds(bounds: Bounds, scaleFactor: number): Bounds {
  return {
    minX: bounds.minX * scaleFactor,
    minY: bounds.minY * scaleFactor,
    maxX: bounds.maxX * scaleFactor,
    maxY: bounds.maxY * scaleFactor,
  };
}

export function createViewportObserver(
  callback: (metrics: ViewportMetrics) => void,
  options: { debounceMs?: number; trackFullscreen?: boolean } = {}
): { disconnect: () => void } {
  const { debounceMs = 150, trackFullscreen = true } = options;
  
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isFullscreen = false;
  
  const updateMetrics = () => {
    const metrics: ViewportMetrics = {
      width: window.innerWidth,
      height: window.innerHeight,
      isFullscreen,
      devicePixelRatio: window.devicePixelRatio,
    };
    callback(metrics);
  };
  
  const debouncedUpdate = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(updateMetrics, debounceMs);
  };
  
  // Track fullscreen changes
  if (trackFullscreen) {
    const handleFullscreenChange = () => {
      isFullscreen = !!(document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement || 
                        document.msFullscreenElement);
      debouncedUpdate();
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  }
  
  // Observe resize
  const resizeObserver = new ResizeObserver(debouncedUpdate);
  resizeObserver.observe(document.body);
  
  // Initial call
  updateMetrics();
  
  return {
    disconnect: () => {
      if (timeoutId) clearTimeout(timeoutId);
      resizeObserver.disconnect();
      if (trackFullscreen) {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      }
    },
  };
}

export function getMinimumFontSize(baseSize: number, scaleFactor: number): number {
  // Ensure font never scales below 12px equivalent
  const minSize = 12;
  const scaledSize = baseSize * scaleFactor;
  return Math.max(scaledSize, minSize);
}

export function shouldEnableReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
