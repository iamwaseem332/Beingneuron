/**
 * Phase 9: Progressive Renderer Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressiveRenderer, useProgressiveGraph } from './ProgressiveRenderer';
import type { GraphNode, GraphEdge } from '../graph/layouts/types';

describe('ProgressiveRenderer', () => {
  let renderer: ProgressiveRenderer;

  const mockNodes: GraphNode[] = [
    { id: 'n1', x: 100, y: 100, width: 50, height: 30 },
    { id: 'n2', x: 200, y: 100, width: 50, height: 30 },
    { id: 'n3', x: 300, y: 100, width: 50, height: 30 },
    { id: 'n4', x: 100, y: 200, width: 50, height: 30 },
    { id: 'n5', x: 200, y: 200, width: 50, height: 30 },
  ];

  const mockEdges: GraphEdge[] = [
    { source: 'n1', target: 'n2' },
    { source: 'n2', target: 'n3' },
    { source: 'n1', target: 'n4' },
    { source: 'n4', target: 'n5' },
  ];

  const mockViewport = {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    zoom: 1
  };

  beforeEach(() => {
    renderer = new ProgressiveRenderer({
      viewportPadding: 0.2,
      neighborDepth: 1,
      maxImmediateNodes: 100,
      frameTimeBudget: 8,
      idleCallbackTimeout: 500
    });
  });

  describe('Priority Computation', () => {
    it('should classify nodes by viewport position', () => {
      const result = renderer.computePriorities(mockNodes, mockEdges, mockViewport);
      
      // All nodes should be in viewport (within 400x300)
      expect(result.immediate.length).toBeGreaterThan(0);
      expect(result.immediate.every(n => n.priority === 'immediate')).toBe(true);
      expect(result.immediate.every(n => n.lodLevel === 0)).toBe(true);
    });

    it('should mark neighbors as deferred', () => {
      const result = renderer.computePriorities(mockNodes, mockEdges, mockViewport);
      
      // Deferred nodes should have priority 'deferred' and lodLevel 1
      if (result.deferred.length > 0) {
        expect(result.deferred.every(n => n.priority === 'deferred')).toBe(true);
        expect(result.deferred.every(n => n.lodLevel === 1)).toBe(true);
      }
    });

    it('should mark distant nodes as background', () => {
      const distantNodes: GraphNode[] = [
        { id: 'far1', x: 1000, y: 1000, width: 50, height: 30 },
        { id: 'far2', x: 1100, y: 1000, width: 50, height: 30 },
      ];
      
      const result = renderer.computePriorities(distantNodes, [], mockViewport);
      
      expect(result.background.every(n => n.priority === 'background')).toBe(true);
      expect(result.background.every(n => n.lodLevel === 2)).toBe(true);
    });
  });

  describe('Frustum Culling', () => {
    it('should detect nodes inside viewport', () => {
      const nodeInViewport: GraphNode = { id: 'center', x: 200, y: 150, width: 50, height: 30 };
      expect(renderer['isInViewport'](nodeInViewport, mockViewport)).toBe(true);
    });

    it('should detect nodes outside viewport', () => {
      const nodeOutside: GraphNode = { id: 'outside', x: 1000, y: 1000, width: 50, height: 30 };
      expect(renderer['isInViewport'](nodeOutside, mockViewport)).toBe(false);
    });

    it('should handle nodes at viewport edge', () => {
      const nodeAtEdge: GraphNode = { id: 'edge', x: 375, y: 150, width: 50, height: 30 };
      expect(renderer['isInViewport'](nodeAtEdge, mockViewport)).toBe(true);
    });
  });

  describe('Viewport Expansion', () => {
    it('should expand viewport by padding percentage', () => {
      const expanded = renderer['expandViewport'](mockViewport, 0.2);
      
      expect(expanded.x).toBe(-80); // 400 * 0.2 = 80
      expect(expanded.y).toBe(-60); // 300 * 0.2 = 60
      expect(expanded.width).toBe(560); // 400 + 160
      expect(expanded.height).toBe(420); // 300 + 120
    });
  });

  describe('Neighbor Discovery', () => {
    it('should find direct neighbors', () => {
      const startNode = mockNodes.filter(n => n.id === 'n1');
      const neighbors = renderer.getNeighbors(startNode, mockEdges, 1);
      
      // n1 connects to n2 and n4
      expect(neighbors.some(n => n.id === 'n2')).toBe(true);
      expect(neighbors.some(n => n.id === 'n4')).toBe(true);
    });

    it('should find neighbors at depth 2', () => {
      const startNode = mockNodes.filter(n => n.id === 'n1');
      const neighbors = renderer.getNeighbors(startNode, mockEdges, 2);
      
      // At depth 2, should include n3 (via n2) and n5 (via n4)
      expect(neighbors.some(n => n.id === 'n3')).toBe(true);
      expect(neighbors.some(n => n.id === 'n5')).toBe(true);
    });

    it('should not include duplicates', () => {
      const startNode = mockNodes.filter(n => n.id === 'n1');
      const neighbors = renderer.getNeighbors(startNode, mockEdges, 3);
      
      const ids = neighbors.map(n => n.id);
      expect(ids.length).toBe(new Set(ids).size);
    });
  });

  describe('LOD Computation', () => {
    it('should return LOD 0 for center nodes', () => {
      const centerNode: GraphNode = { id: 'center', x: 200, y: 150, width: 50, height: 30 };
      const lod = renderer.computeLOD(centerNode, mockViewport);
      expect(lod).toBe(0);
    });

    it('should return LOD 2 for distant nodes', () => {
      const farNode: GraphNode = { id: 'far', x: 1000, y: 1000, width: 50, height: 30 };
      const lod = renderer.computeLOD(farNode, mockViewport);
      expect(lod).toBe(2);
    });
  });

  describe('Work Scheduling', () => {
    it('should schedule and execute work', (done) => {
      let executed = false;
      
      renderer.scheduleDeferredWork(() => {
        executed = true;
        done();
      });

      // Work should be queued
      expect(executed).toBe(false);
    });

    it('should cancel pending work', () => {
      let executed = false;
      
      renderer.scheduleDeferredWork(() => {
        executed = true;
      });
      
      renderer.cancel();
      
      // After cancel, work should not execute
      // (Note: this is hard to test deterministically)
      expect(renderer['pendingWork'].length).toBe(0);
    });
  });

  describe('useProgressiveGraph Hook Simulation', () => {
    it('should return categorized nodes', () => {
      const result = useProgressiveGraph(mockNodes, mockEdges, mockViewport);
      
      expect(result).toHaveProperty('visibleNodes');
      expect(result).toHaveProperty('deferredNodes');
      expect(result).toHaveProperty('backgroundNodes');
      expect(typeof result.scheduleWork).toBe('function');
      expect(typeof result.cancel).toBe('function');
    });
  });
});
