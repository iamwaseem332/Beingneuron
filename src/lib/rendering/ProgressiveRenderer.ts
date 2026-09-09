/**
 * Phase 9: Progressive Rendering Pipeline
 * Implements priority-based disclosure with frustum culling and LOD strategies
 */

import { GraphNode, GraphEdge } from '../graph/layouts/types';

export interface ViewportMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export type RenderPriority = 'immediate' | 'deferred' | 'background';

export interface RenderableNode extends GraphNode {
  priority: RenderPriority;
  lodLevel: 0 | 1 | 2; // 0=full detail, 1=simplified, 2=minimal
}

export interface ProgressiveRendererConfig {
  viewportPadding: number; // % padding around viewport for immediate rendering
  neighborDepth: number; // depth for deferred neighbor expansion
  maxImmediateNodes: number;
  frameTimeBudget: number; // ms per frame
  idleCallbackTimeout: number;
}

const DEFAULT_CONFIG: ProgressiveRendererConfig = {
  viewportPadding: 0.2,
  neighborDepth: 1,
  maxImmediateNodes: 100,
  frameTimeBudget: 8,
  idleCallbackTimeout: 500
};

export class ProgressiveRenderer {
  private config: ProgressiveRendererConfig;
  private rafId: number | null = null;
  private pendingWork: Array<() => void> = [];

  constructor(config: Partial<ProgressiveRendererConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compute render priorities based on viewport
   */
  computePriorities(
    nodes: GraphNode[],
    edges: GraphEdge[],
    viewport: ViewportMetrics
  ): { 
    immediate: RenderableNode[]; 
    deferred: RenderableNode[]; 
    background: RenderableNode[];
  } {
    const paddedViewport = this.expandViewport(viewport, this.config.viewportPadding);
    
    // Priority 1: Nodes in visible viewport + padding
    const immediate = nodes.filter(node => 
      this.isInViewport(node, paddedViewport)
    ).slice(0, this.config.maxImmediateNodes).map(node => ({
      ...node,
      priority: 'immediate' as const,
      lodLevel: 0 as const
    }));

    const immediateIds = new Set(immediate.map(n => n.id));

    // Priority 2: Direct neighbors of immediate nodes
    const deferredIds = new Set<string>();
    for (const edge of edges) {
      if (immediateIds.has(edge.source)) {
        deferredIds.add(edge.target);
      }
      if (immediateIds.has(edge.target)) {
        deferredIds.add(edge.source);
      }
    }

    const deferred = nodes
      .filter(node => deferredIds.has(node.id) && !immediateIds.has(node.id))
      .map(node => ({
        ...node,
        priority: 'deferred' as const,
        lodLevel: 1 as const
      }));

    const deferredNodeIds = new Set([...immediateIds, ...deferredIds]);

    // Priority 3: Everything else (background)
    const background = nodes
      .filter(node => !deferredNodeIds.has(node.id))
      .map(node => ({
        ...node,
        priority: 'background' as const,
        lodLevel: 2 as const
      }));

    return { immediate, deferred, background };
  }

  /**
   * Frustum culling - determine if node is in viewport
   */
  private isInViewport(node: GraphNode, viewport: ViewportMetrics): boolean {
    const nodeCenterX = node.x + (node.width || 0) / 2;
    const nodeCenterY = node.y + (node.height || 0) / 2;

    return (
      nodeCenterX >= viewport.x &&
      nodeCenterX <= viewport.x + viewport.width &&
      nodeCenterY >= viewport.y &&
      nodeCenterY <= viewport.y + viewport.height
    );
  }

  /**
   * Expand viewport by padding percentage
   */
  private expandViewport(viewport: ViewportMetrics, padding: number): ViewportMetrics {
    const padX = viewport.width * padding;
    const padY = viewport.height * padding;

    return {
      ...viewport,
      x: viewport.x - padX,
      y: viewport.y - padY,
      width: viewport.width + padX * 2,
      height: viewport.height + padY * 2
    };
  }

  /**
   * Get neighbors of nodes up to specified depth
   */
  getNeighbors(nodes: GraphNode[], edges: GraphEdge[], depth: number): GraphNode[] {
    const result = new Map<string, GraphNode>();
    const visited = new Set<string>();
    let currentLevel = [...nodes];

    for (let d = 0; d < depth; d++) {
      const nextLevel: GraphNode[] = [];
      
      for (const node of currentLevel) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        result.set(node.id, node);

        // Find connected nodes
        for (const edge of edges) {
          let neighbor: GraphNode | undefined;
          if (edge.source === node.id) {
            neighbor = nodes.find(n => n.id === edge.target);
          } else if (edge.target === node.id) {
            neighbor = nodes.find(n => n.id === edge.source);
          }
          
          if (neighbor && !visited.has(neighbor.id)) {
            nextLevel.push(neighbor);
          }
        }
      }
      
      currentLevel = nextLevel;
    }

    return Array.from(result.values());
  }

  /**
   * Schedule rendering work using requestIdleCallback
   */
  scheduleDeferredWork(work: () => void): void {
    this.pendingWork.push(work);
    this.processPendingWork();
  }

  private processPendingWork(): void {
    if (this.rafId !== null) return;

    if ('requestIdleCallback' in window) {
      requestIdleCallback((deadline) => {
        this.executeWork(deadline);
      }, { timeout: this.config.idleCallbackTimeout });
    } else {
      // Fallback to setTimeout
      setTimeout(() => {
        this.executeWork({
          timeRemaining: () => this.config.frameTimeBudget,
          didTimeout: false
        } as IdleDeadline);
      }, 10);
    }
  }

  private executeWork(deadline: IdleDeadline): void {
    this.rafId = null;

    while (this.pendingWork.length > 0 && deadline.timeRemaining() > this.config.frameTimeBudget) {
      const work = this.pendingWork.shift();
      if (work) work();
    }

    if (this.pendingWork.length > 0) {
      this.processPendingWork();
    }
  }

  /**
   * Compute LOD level based on distance from viewport center
   */
  computeLOD(node: GraphNode, viewport: ViewportMetrics): 0 | 1 | 2 {
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;
    const dx = node.x - centerX;
    const dy = node.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = Math.max(viewport.width, viewport.height) / 2;

    const normalizedDistance = distance / maxDistance;

    if (normalizedDistance < 0.5) return 0; // Full detail
    if (normalizedDistance < 0.8) return 1; // Simplified
    return 2; // Minimal
  }

  /**
   * Cancel all pending work
   */
  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingWork = [];
  }

  dispose(): void {
    this.cancel();
  }
}

/**
 * React hook for progressive graph rendering
 */
export function useProgressiveGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  viewport: ViewportMetrics
) {
  const renderer = new ProgressiveRenderer();
  
  const { immediate, deferred, background } = renderer.computePriorities(
    nodes,
    edges,
    viewport
  );

  return {
    visibleNodes: immediate,
    deferredNodes: deferred,
    backgroundNodes: background,
    scheduleWork: (work: () => void) => renderer.scheduleDeferredWork(work),
    cancel: () => renderer.cancel()
  };
}
