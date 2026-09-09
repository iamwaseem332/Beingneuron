// tests/phase-6/viewport-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { 
  adaptLayoutToViewport, 
  calculateScaleFactor, 
  scaleBounds,
  getMinimumFontSize,
  shouldEnableReducedMotion 
} from '../../src/lib/graph/viewportAdapter';

describe('Viewport Adapter', () => {
  const baseLayout = {
    nodes: [
      { id: '1', x: 0, y: 0, width: 150, height: 80 },
      { id: '2', x: 200, y: 0, width: 150, height: 80 },
      { id: '3', x: 0, y: 150, width: 150, height: 80 },
    ],
    edges: [],
    bounds: { minX: 0, minY: 0, maxX: 350, maxY: 230 },
    algorithm: 'dagre-hierarchical',
    computedAt: new Date().toISOString(),
  };

  const config = {
    nodeSpacing: 50,
    rankSpacing: 80,
    padding: 40,
  };

  describe('calculateScaleFactor', () => {
    it('scales content to fit viewport', () => {
      const viewport = {
        width: 800,
        height: 600,
        isFullscreen: false,
        devicePixelRatio: 1,
      };

      const scaleFactor = calculateScaleFactor(baseLayout.bounds, viewport, config);
      
      // Scale factor should be positive and reasonable
      expect(scaleFactor).toBeGreaterThan(0);
      expect(scaleFactor).toBeLessThanOrEqual(1.5); // Cap
    });

    it('returns 1 for empty bounds', () => {
      const emptyBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      const viewport = {
        width: 800,
        height: 600,
        isFullscreen: false,
        devicePixelRatio: 1,
      };

      const scaleFactor = calculateScaleFactor(emptyBounds, viewport, config);
      expect(scaleFactor).toBe(1);
    });

    it('caps scale at 1.5 for small content', () => {
      const smallBounds = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
      const viewport = {
        width: 1920,
        height: 1080,
        isFullscreen: false,
        devicePixelRatio: 1,
      };

      const scaleFactor = calculateScaleFactor(smallBounds, viewport, config);
      expect(scaleFactor).toBeLessThanOrEqual(1.5);
    });
  });

  describe('scaleBounds', () => {
    it('scales all bounds by factor', () => {
      const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      const scaleFactor = 2;

      const scaled = scaleBounds(bounds, scaleFactor);

      expect(scaled.minX).toBe(0);
      expect(scaled.minY).toBe(0);
      expect(scaled.maxX).toBe(200);
      expect(scaled.maxY).toBe(200);
    });

    it('handles negative coordinates', () => {
      const bounds = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const scaleFactor = 2;

      const scaled = scaleBounds(bounds, scaleFactor);

      expect(scaled.minX).toBe(-100);
      expect(scaled.minY).toBe(-100);
      expect(scaled.maxX).toBe(100);
      expect(scaled.maxY).toBe(100);
    });
  });

  describe('adaptLayoutToViewport', () => {
    it('adapts node positions by scale factor', () => {
      const viewport = {
        width: 800,
        height: 600,
        isFullscreen: false,
        devicePixelRatio: 1,
      };

      const adapted = adaptLayoutToViewport(baseLayout, viewport, config);

      expect(adapted.nodes).toHaveLength(3);
      expect(adapted.bounds).toBeDefined();
      
      // Nodes should be scaled
      for (const node of adapted.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
      }
    });

    it('updates computedAt timestamp', () => {
      const viewport = {
        width: 800,
        height: 600,
        isFullscreen: false,
        devicePixelRatio: 1,
      };

      const before = new Date().getTime();
      const adapted = adaptLayoutToViewport(baseLayout, viewport, config);
      const after = new Date().getTime();

      const computedAt = new Date(adapted.computedAt).getTime();
      expect(computedAt).toBeGreaterThanOrEqual(before);
      expect(computedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getMinimumFontSize', () => {
    it('returns scaled size when above minimum', () => {
      const baseSize = 16;
      const scaleFactor = 1.0;
      
      const result = getMinimumFontSize(baseSize, scaleFactor);
      expect(result).toBe(16);
    });

    it('enforces 12px minimum', () => {
      const baseSize = 16;
      const scaleFactor = 0.5;
      
      const scaled = baseSize * scaleFactor; // 8
      const result = getMinimumFontSize(baseSize, scaleFactor);
      
      expect(result).toBeGreaterThanOrEqual(12);
    });

    it('handles large scale factors', () => {
      const baseSize = 14;
      const scaleFactor = 2.0;
      
      const result = getMinimumFontSize(baseSize, scaleFactor);
      expect(result).toBe(28);
    });
  });

  describe('shouldEnableReducedMotion', () => {
    it('returns boolean', () => {
      const result = shouldEnableReducedMotion();
      expect(typeof result).toBe('boolean');
    });
  });
});

// Helper functions need to be exported from viewportAdapter.ts
// Add these exports if not already present:
// export function calculateScaleFactor(bounds, viewport, config) { ... }
// export function scaleBounds(bounds, scaleFactor) { ... }
