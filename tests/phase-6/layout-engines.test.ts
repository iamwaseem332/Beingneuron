// tests/phase-6/layout-engines.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LayoutEngineFactory } from '../../src/lib/graph/layouts';
import { DagreLayoutEngine } from '../../src/lib/graph/layouts/DagreLayoutEngine';
import { ElkLayoutEngine } from '../../src/lib/graph/layouts/ElkLayoutEngine';
import { ForceDirectedLayoutEngine } from '../../src/lib/graph/layouts/ForceDirectedLayoutEngine';

describe('Layout Engines', () => {
  const sampleNodes = [
    { id: '1', type: 'concept', label: 'Machine Learning', data: { width: 150, height: 80 } },
    { id: '2', type: 'method', label: 'Neural Networks', data: { width: 150, height: 80 } },
    { id: '3', type: 'model', label: 'Transformer', data: { width: 150, height: 80 } },
    { id: '4', type: 'dataset', label: 'ImageNet', data: { width: 150, height: 80 } },
  ];

  const sampleEdges = [
    { source: '1', target: '2', type: 'uses', isExplicitlyStated: true },
    { source: '2', target: '3', type: 'extends', isExplicitlyStated: true },
    { source: '3', target: '4', type: 'evaluates_on', isExplicitlyStated: true },
  ];

  describe('DagreLayoutEngine', () => {
    const engine = new DagreLayoutEngine();

    it('supports dagre-hierarchical algorithm', () => {
      expect(engine.supports('dagre-hierarchical')).toBe(true);
      expect(engine.supports('elk-layered')).toBe(false);
    });

    it('computes layout with valid positions', async () => {
      const result = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'dagre-hierarchical',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);
      expect(result.algorithm).toBe('dagre-hierarchical');
      
      // All nodes should have valid coordinates
      for (const node of result.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
        expect(node.width).toBeGreaterThan(0);
        expect(node.height).toBeGreaterThan(0);
      }
    });

    it('produces deterministic results', async () => {
      const result1 = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'dagre-hierarchical',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      const result2 = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'dagre-hierarchical',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      // Positions should be identical
      expect(result1.nodes).toEqual(result2.nodes);
    });
  });

  describe('ElkLayoutEngine', () => {
    const engine = new ElkLayoutEngine();

    it('supports elk-layered algorithm', () => {
      expect(engine.supports('elk-layered')).toBe(true);
      expect(engine.supports('force-directed')).toBe(false);
    });

    it('computes layout or falls back to grid', async () => {
      const result = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'elk-layered',
        direction: 'LR',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);
      expect(result.algorithm).toBe('elk-layered');
    });
  });

  describe('ForceDirectedLayoutEngine', () => {
    const engine = new ForceDirectedLayoutEngine();

    it('supports force-directed algorithm', () => {
      expect(engine.supports('force-directed')).toBe(true);
    });

    it('computes layout within bounded iterations', async () => {
      const result = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'force-directed',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);
      
      // Nodes should be spread out (not all at origin)
      const positions = result.nodes.map(n => `${n.x},${n.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBeGreaterThan(1);
    });

    it('produces near-deterministic results with same seed', async () => {
      const result1 = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'force-directed',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      const result2 = await engine.compute(sampleNodes, sampleEdges, {
        algorithm: 'force-directed',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      // Should be very similar (within 2px tolerance)
      for (let i = 0; i < result1.nodes.length; i++) {
        const dx = Math.abs(result1.nodes[i].x - result2.nodes[i].x);
        const dy = Math.abs(result1.nodes[i].y - result2.nodes[i].y);
        expect(dx).toBeLessThanOrEqual(2);
        expect(dy).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('LayoutEngineFactory', () => {
    it('returns correct engine for algorithm', () => {
      expect(LayoutEngineFactory.getEngine('dagre-hierarchical')).toBeInstanceOf(DagreLayoutEngine);
      expect(LayoutEngineFactory.getEngine('elk-layered')).toBeInstanceOf(ElkLayoutEngine);
      expect(LayoutEngineFactory.getEngine('force-directed')).toBeInstanceOf(ForceDirectedLayoutEngine);
    });

    it('throws error for unknown algorithm', () => {
      expect(() => LayoutEngineFactory.getEngine('unknown' as any))
        .toThrow('No layout engine found for algorithm: unknown');
    });

    it('computes layout via factory', async () => {
      const result = await LayoutEngineFactory.compute(sampleNodes, sampleEdges, {
        algorithm: 'dagre-hierarchical',
        direction: 'TB',
        nodeSpacing: 50,
        rankSpacing: 80,
        padding: 40,
        animateTransition: false,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.bounds).toBeDefined();
      expect(result.computedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });
});
