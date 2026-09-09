// src/lib/graph/layouts/index.ts
export type { LayoutEngine, LayoutConfig, LayoutResult, GraphNode, GraphEdge, NodePosition, LayoutAlgorithm } from './types';
export { DagreLayoutEngine } from './DagreLayoutEngine';
export { ElkLayoutEngine } from './ElkLayoutEngine';
export { ForceDirectedLayoutEngine } from './ForceDirectedLayoutEngine';

import type { LayoutEngine, LayoutConfig, LayoutResult, GraphNode, GraphEdge, LayoutAlgorithm } from './types';
import { DagreLayoutEngine } from './DagreLayoutEngine';
import { ElkLayoutEngine } from './ElkLayoutEngine';
import { ForceDirectedLayoutEngine } from './ForceDirectedLayoutEngine';

export class LayoutEngineFactory {
  private static engines: Map<string, LayoutEngine> = new Map([
    ['dagre-hierarchical', new DagreLayoutEngine()],
    ['elk-layered', new ElkLayoutEngine()],
    ['force-directed', new ForceDirectedLayoutEngine()],
  ]);

  static getEngine(algorithm: LayoutAlgorithm): LayoutEngine {
    const engine = this.engines.get(algorithm);
    if (!engine) {
      throw new Error(`No layout engine found for algorithm: ${algorithm}`);
    }
    return engine;
  }

  static async compute(
    nodes: GraphNode[], 
    edges: GraphEdge[], 
    config: LayoutConfig
  ): Promise<LayoutResult> {
    const engine = this.getEngine(config.algorithm);
    return engine.compute(nodes, edges, config);
  }

  static registerEngine(algorithm: string, engine: LayoutEngine): void {
    this.engines.set(algorithm, engine);
  }
}
