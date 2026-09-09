// src/lib/graph/layouts/ForceDirectedLayoutEngine.ts
import { LayoutEngine, LayoutConfig, LayoutResult, GraphNode, GraphEdge } from './types';

interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  degree: number;
}

interface ForceEdge {
  source: string;
  target: string;
}

export class ForceDirectedLayoutEngine implements LayoutEngine {
  supports(algorithm: string): boolean {
    return algorithm === 'force-directed';
  }

  async compute(nodes: GraphNode[], edges: GraphEdge[], config: LayoutConfig): Promise<LayoutResult> {
    // Initialize nodes with deterministic seed positions based on ID hash
    const nodeMap = new Map<string, ForceNode>();
    
    for (const node of nodes) {
      const hash = this.hashString(node.id);
      const angle = (hash % 360) * (Math.PI / 180);
      const radius = 200 + (hash % 100);
      
      nodeMap.set(node.id, {
        id: node.id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        width: node.data?.width || 150,
        height: node.data?.height || 80,
        degree: 0,
      });
    }

    // Calculate node degrees for collision scaling
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (source) source.degree++;
      if (target) target.degree++;
    }

    const forceEdges: ForceEdge[] = edges.map(e => ({ source: e.source, target: e.target }));
    const forceNodes = Array.from(nodeMap.values());

    // Run simulation with bounded iterations for stability
    const iterations = 300;
    const alphaDecay = 0.02;
    let alpha = 1;

    for (let i = 0; i < iterations && alpha > 0.01; i++) {
      this.tick(forceNodes, forceEdges, config, alpha);
      alpha *= (1 - alphaDecay);
    }

    // Extract final positions
    const layoutNodes = forceNodes.map(node => ({
      id: node.id,
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    }));

    const layoutEdges = edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      points: [],
    }));

    // Compute bounds
    const minX = Math.min(...layoutNodes.map(n => n.x), 0);
    const minY = Math.min(...layoutNodes.map(n => n.y), 0);
    const maxX = Math.max(...layoutNodes.map(n => n.x + n.width), 0);
    const maxY = Math.max(...layoutNodes.map(n => n.y + n.height), 0);

    return {
      nodes: layoutNodes,
      edges: layoutEdges,
      bounds: { minX, minY, maxX, maxY },
      algorithm: 'force-directed',
      computedAt: new Date().toISOString(),
    };
  }

  private tick(nodes: ForceNode[], edges: ForceEdge[], config: LayoutConfig, alpha: number): void {
    const centerForce = { x: 0, y: 0 };
    
    // Apply forces
    for (const node of nodes) {
      // Center gravity
      node.vx += -node.x * 0.001 * alpha;
      node.vy += -node.y * 0.001 * alpha;

      // Repulsion from other nodes (scaled by degree)
      for (const other of nodes) {
        if (node === other) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const repulsion = (500 * (1 + node.degree * 0.1)) / (dist * dist);
        node.vx += (dx / dist) * repulsion * alpha;
        node.vy += (dy / dist) * repulsion * alpha;
      }
    }

    // Spring forces for edges
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealLength = 200;
      const springForce = (dist - idealLength) * 0.01 * alpha;

      source.vx += (dx / dist) * springForce;
      source.vy += (dy / dist) * springForce;
      target.vx -= (dx / dist) * springForce;
      target.vy -= (dy / dist) * springForce;
    }

    // Apply velocities with damping
    const damping = 0.9;
    for (const node of nodes) {
      node.x += node.vx * damping;
      node.y += node.vy * damping;
      node.vx *= damping;
      node.vy *= damping;

      // Boundary constraints
      const boundary = 1000;
      if (node.x < -boundary) node.x = -boundary;
      if (node.x > boundary) node.x = boundary;
      if (node.y < -boundary) node.y = -boundary;
      if (node.y > boundary) node.y = boundary;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
