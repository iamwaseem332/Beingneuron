// src/lib/graph/layouts/DagreLayoutEngine.ts
import { LayoutEngine, LayoutConfig, LayoutResult, GraphNode, GraphEdge } from './types';

// Dagre is typically installed as: npm install dagre @types/dagre
let dagre: typeof import('dagre') | null = null;

export class DagreLayoutEngine implements LayoutEngine {
  supports(algorithm: string): boolean {
    return algorithm === 'dagre-hierarchical';
  }

  async compute(nodes: GraphNode[], edges: GraphEdge[], config: LayoutConfig): Promise<LayoutResult> {
    // Dynamically import dagre to avoid bundling issues
    if (!dagre) {
      try {
        dagre = await import('dagre');
      } catch (e) {
        throw new Error('Dagre library not available. Install with: npm install dagre');
      }
    }

    const graph = new dagre.graphlib.Graph();
    graph.setGraph({
      rankdir: config.direction,
      nodesep: config.nodeSpacing,
      ranksep: config.rankSpacing,
    });
    graph.setDefaultEdgeLabel(() => ({}));

    // Add nodes with dimensions
    for (const node of nodes) {
      graph.setNode(node.id, {
        width: node.data?.width || 150,
        height: node.data?.height || 80,
        label: node.label,
      });
    }

    // Add edges
    for (const edge of edges) {
      graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    // Extract positions
    const layoutNodes = graph.nodes().map((nodeId: string) => {
      const node = graph.node(nodeId);
      return {
        id: nodeId,
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
        width: node.width,
        height: node.height,
      };
    });

    const layoutEdges = graph.edges().map((edge: any) => {
      const points = graph.edge(edge).points || [];
      return {
        source: edge.v,
        target: edge.w,
        points: points.map((p: any) => ({ x: p.x, y: p.y })),
      };
    });

    // Compute bounds
    const minX = Math.min(...layoutNodes.map(n => n.x), 0);
    const minY = Math.min(...layoutNodes.map(n => n.y), 0);
    const maxX = Math.max(...layoutNodes.map(n => n.x + n.width), 0);
    const maxY = Math.max(...layoutNodes.map(n => n.y + n.height), 0);

    return {
      nodes: layoutNodes,
      edges: layoutEdges,
      bounds: { minX, minY, maxX, maxY },
      algorithm: 'dagre-hierarchical',
      computedAt: new Date().toISOString(),
    };
  }
}
