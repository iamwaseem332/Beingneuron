// src/lib/graph/layouts/types.ts
export type LayoutAlgorithm = 'dagre-hierarchical' | 'elk-layered' | 'force-directed';

export interface LayoutConfig {
  algorithm: LayoutAlgorithm;
  direction: 'TB' | 'BT' | 'LR' | 'RL'; // Top-Bottom, Left-Right etc.
  nodeSpacing: number;   // px between nodes
  rankSpacing: number;   // px between hierarchy levels
  padding: number;       // container padding
  animateTransition: boolean;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  data?: Record<string, unknown>;
  sectionLevel?: number;
  parentChunkId?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  isExplicitlyStated: boolean;
  data?: Record<string, unknown>;
}

export interface LayoutResult {
  nodes: NodePosition[];
  edges: Array<{ source: string; target: string; points: Array<{x:number,y:number}> }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  algorithm: LayoutAlgorithm;
  computedAt: string; // ISO timestamp for cache keying
}

export interface LayoutEngine {
  compute(nodes: GraphNode[], edges: GraphEdge[], config: LayoutConfig): Promise<LayoutResult>;
  supports(algorithm: LayoutAlgorithm): boolean;
}

export class InvalidLayoutConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLayoutConfigError';
  }
}
