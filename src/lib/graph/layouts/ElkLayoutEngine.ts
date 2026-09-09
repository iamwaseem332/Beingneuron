// src/lib/graph/layouts/ElkLayoutEngine.ts
import { LayoutEngine, LayoutConfig, LayoutResult, GraphNode, GraphEdge } from './types';

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  children?: ElkNode[];
  labels?: Array<{ text: string }>;
}

interface ElkEdge {
  id?: string;
  sources: string[];
  targets: string[];
}

interface ElkLayoutOptions {
  'elk.algorithm': string;
  'elk.direction': string;
  'elk.spacing.nodeNode': string;
  'elk.layering.spacing': string;
  'elk.edgeRouting': string;
}

export class ElkLayoutEngine implements LayoutEngine {
  supports(algorithm: string): boolean {
    return algorithm === 'elk-layered';
  }

  async compute(nodes: GraphNode[], edges: GraphEdge[], config: LayoutConfig): Promise<LayoutResult> {
    // ELK requires web-worker or server-side execution
    // This implementation assumes elkjs is available
    let ELK: any;
    try {
      const elkModule = await import('elkjs');
      ELK = elkModule.default || elkModule.ELK;
    } catch (e) {
      throw new Error('ELK library not available. Install with: npm install elkjs');
    }

    const elk = new ELK({
      defaultLayoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': config.direction,
        'elk.spacing.nodeNode': config.nodeSpacing.toString(),
        'elk.layering.spacing': config.rankSpacing.toString(),
        'elk.edgeRouting': 'ORTHOGONAL',
      } as ElkLayoutOptions,
    });

    const elkGraph: ElkNode = {
      id: 'root',
      children: nodes.map(node => ({
        id: node.id,
        width: node.data?.width || 150,
        height: node.data?.height || 80,
        labels: [{ text: node.label }],
      })),
      edges: edges.map(edge => ({
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    try {
      const layout = await elk.layout(elkGraph);
      
      const layoutNodes = (layout.children || []).map((node: any) => ({
        id: node.id,
        x: node.x || 0,
        y: node.y || 0,
        width: node.width || 150,
        height: node.height || 80,
      }));

      const layoutEdges = (layout.edges || []).map((edge: any) => ({
        source: edge.sources[0],
        target: edge.targets[0],
        points: edge.sections?.[0]?.controlPoints || [],
      }));

      // Compute bounds
      const minX = Math.min(...layoutNodes.map((n: any) => n.x), 0);
      const minY = Math.min(...layoutNodes.map((n: any) => n.y), 0);
      const maxX = Math.max(...layoutNodes.map((n: any) => n.x + n.width), 0);
      const maxY = Math.max(...layoutNodes.map((n: any) => n.y + n.height), 0);

      return {
        nodes: layoutNodes,
        edges: layoutEdges,
        bounds: { minX, minY, maxX, maxY },
        algorithm: 'elk-layered',
        computedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Fallback to simple grid layout if ELK fails
      console.warn('ELK layout failed, falling back to grid layout', error);
      return this.fallbackGridLayout(nodes, edges, config);
    }
  }

  private fallbackGridLayout(nodes: GraphNode[], edges: GraphEdge[], config: LayoutConfig): LayoutResult {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const nodeWidth = 150;
    const nodeHeight = 80;
    
    const layoutNodes = nodes.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        id: node.id,
        x: col * (nodeWidth + config.nodeSpacing),
        y: row * (nodeHeight + config.rankSpacing),
        width: nodeWidth,
        height: nodeHeight,
      };
    });

    const layoutEdges = edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      points: [],
    }));

    const minX = 0;
    const minY = 0;
    const maxX = cols * (nodeWidth + config.nodeSpacing);
    const maxY = Math.ceil(nodes.length / cols) * (nodeHeight + config.rankSpacing);

    return {
      nodes: layoutNodes,
      edges: layoutEdges,
      bounds: { minX, minY, maxX, maxY },
      algorithm: 'elk-layered',
      computedAt: new Date().toISOString(),
    };
  }
}
