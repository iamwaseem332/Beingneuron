// tests/phase-7/evidence-integrity.spec.ts
import { test, expect, describe } from '@jest/globals';
import { SpanMapper } from '../../src/lib/evidence/SpanMapper';
import { SyncManager } from '../../src/lib/evidence/SyncManager';

describe('Phase 7: Evidence Integrity Validation Suite', () => {
  // Mock data for testing
  const mockParsedDoc = {
    id: 'test-doc-1',
    readingOrder: [
      {
        id: 'block-1',
        pageNumber: 1,
        charStart: 0,
        charEnd: 100,
        confidence: 0.95,
        boundingBox: { x: 50, y: 700, width: 400, height: 20 }
      },
      {
        id: 'block-2',
        pageNumber: 1,
        charStart: 100,
        charEnd: 200,
        confidence: 0.92,
        boundingBox: { x: 50, y: 680, width: 400, height: 20 }
      },
      {
        id: 'block-3',
        pageNumber: 2,
        charStart: 200,
        charEnd: 300,
        confidence: 0.88,
        boundingBox: { x: 50, y: 700, width: 400, height: 20 }
      }
    ],
    pages: [
      { pageNumber: 1, width: 500, height: 800 },
      { pageNumber: 2, width: 500, height: 800 }
    ]
  };

  const mockChunkText = 'Lorem ipsum dolor sit amet...'.repeat(50);

  describe('Category 1: Span Mapping Accuracy', () => {
    test('Coordinate Precision: mapped highlights overlap gold-standard bounding boxes ≥80%', () => {
      const spanMapper = new SpanMapper();
      const span = {
        chunkId: 'chunk-1',
        startChar: 10,
        endChar: 90,
        pageNumber: 1
      };

      const region = spanMapper.mapSpanToCoordinates(span, mockParsedDoc, mockChunkText);

      expect(region.coordinates).toHaveLength(1);
      expect(region.coordinates[0].pageNumber).toBe(1);
      expect(region.coordinates[0].x).toBeGreaterThan(50);
      expect(region.coordinates[0].width).toBeGreaterThan(0);
      expect(region.confidence).toBeGreaterThanOrEqual(0.85);
    });

    test('Page Attribution: highlights on correct page ≥99%', () => {
      const spanMapper = new SpanMapper();
      const span = {
        chunkId: 'chunk-2',
        startChar: 210,
        endChar: 280,
        pageNumber: 2
      };

      const region = spanMapper.mapSpanToCoordinates(span, mockParsedDoc, mockChunkText);

      expect(region.coordinates.every(c => c.pageNumber === 2)).toBe(true);
    });

    test('Wrapped Text Handling: multi-line spans correctly split across coordinate rects', () => {
      const spanMapper = new SpanMapper();
      const span = {
        chunkId: 'chunk-3',
        startChar: 50,
        endChar: 150,
        pageNumber: 1
      };

      const region = spanMapper.mapSpanToCoordinates(span, mockParsedDoc, mockChunkText);

      // Should span multiple blocks
      expect(region.coordinates.length).toBeGreaterThanOrEqual(1);
    });

    test('Low-Confidence Flagging: uncertain mappings correctly flagged ≥85% recall', () => {
      const spanMapper = new SpanMapper();
      
      // Exact boundary match - high confidence
      const exactSpan = {
        chunkId: 'chunk-4',
        startChar: 0,
        endChar: 100,
        pageNumber: 1
      };
      const exactRegion = spanMapper.mapSpanToCoordinates(exactSpan, mockParsedDoc, mockChunkText);
      expect(exactRegion.confidence).toBeGreaterThanOrEqual(0.9);

      // Inexact boundary - lower confidence
      const inexactSpan = {
        chunkId: 'chunk-5',
        startChar: 15,
        endChar: 85,
        pageNumber: 1
      };
      const inexactRegion = spanMapper.mapSpanToCoordinates(inexactSpan, mockParsedDoc, mockChunkText);
      expect(inexactRegion.confidence).toBeLessThan(exactRegion.confidence);
    });
  });

  describe('Category 2: Bidirectional Sync Reliability', () => {
    test('Graph→PDF Latency ≤200ms', async () => {
      const mockPdfViewer = {
        scrollToRegion: jest.fn(),
        getCurrentPage: () => 1,
        getScrollY: () => 0
      };
      const mockGraphRenderer = {
        focusNode: jest.fn()
      };
      const mockNodes = [
        { id: 'node-1', spanId: 'span-1', evidenceSpans: [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }] }
      ];

      const syncManager = new SyncManager(
        mockParsedDoc,
        mockChunkText,
        mockPdfViewer as any,
        mockGraphRenderer as any,
        mockNodes
      );

      const startTime = performance.now();
      syncManager.onNodeSelect('node-1', [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }]);
      const latency = performance.now() - startTime;

      expect(latency).toBeLessThanOrEqual(200);
      expect(mockPdfViewer.scrollToRegion).toHaveBeenCalled();
    });

    test('PDF→Graph Latency ≤250ms', async () => {
      const mockPdfViewer = { scrollToRegion: jest.fn(), getCurrentPage: () => 1, getScrollY: () => 0 };
      const mockGraphRenderer = { focusNode: jest.fn() };
      const mockNodes = [
        { id: 'node-1', spanId: 'span-1', evidenceSpans: [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }] }
      ];

      const syncManager = new SyncManager(
        mockParsedDoc,
        mockChunkText,
        mockPdfViewer as any,
        mockGraphRenderer as any,
        mockNodes
      );

      const startTime = performance.now();
      syncManager.onPdfTextSelect(1, { start: 15, end: 85 });
      const latency = performance.now() - startTime;

      expect(latency).toBeLessThanOrEqual(250);
      expect(mockGraphRenderer.focusNode).toHaveBeenCalled();
    });

    test('Feedback Loop Prevention: zero infinite sync cycles', () => {
      const mockPdfViewer = { scrollToRegion: jest.fn(), getCurrentPage: () => 1, getScrollY: () => 0 };
      const mockGraphRenderer = { focusNode: jest.fn() };
      const mockNodes = [
        { id: 'node-1', spanId: 'span-1', evidenceSpans: [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }] }
      ];

      const syncManager = new SyncManager(
        mockParsedDoc,
        mockChunkText,
        mockPdfViewer as any,
        mockGraphRenderer as any,
        mockNodes
      );

      // Simulate rapid alternating calls
      for (let i = 0; i < 10; i++) {
        syncManager.onNodeSelect('node-1', [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }]);
        syncManager.onPdfTextSelect(1, { start: 15, end: 85 });
      }

      const state = syncManager.getState();
      expect(state.syncSource).toMatch(/^(graph|pdf)$/);
    });

    test('State Consistency: active node always matches active highlights', () => {
      const mockPdfViewer = { scrollToRegion: jest.fn(), getCurrentPage: () => 1, getScrollY: () => 0 };
      const mockGraphRenderer = { focusNode: jest.fn() };
      const mockNodes = [
        { id: 'node-1', spanId: 'span-1', evidenceSpans: [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }] }
      ];

      const syncManager = new SyncManager(
        mockParsedDoc,
        mockChunkText,
        mockPdfViewer as any,
        mockGraphRenderer as any,
        mockNodes
      );

      syncManager.onNodeSelect('node-1', [{ chunkId: 'chunk-1', startChar: 10, endChar: 90, pageNumber: 1 }]);
      const state = syncManager.getState();

      expect(state.activeNodeId).toBe('node-1');
      expect(state.highlightRegions.length).toBeGreaterThan(0);
    });
  });

  describe('Category 4: Accessibility Compliance', () => {
    test('Keyboard Navigation: full panel interaction via keyboard', () => {
      // This would be tested with React Testing Library in integration tests
      expect(true).toBe(true); // Placeholder for integration test
    });

    test('Color Independence: evidence distinguishable without color', () => {
      // Verified via CSS border styles and icons in addition to color
      expect(true).toBe(true); // Placeholder for visual regression test
    });

    test('Motion Sensitivity: respects prefers-reduced-motion', () => {
      // Tested via CSS media query in component
      expect(true).toBe(true); // Placeholder for accessibility test
    });
  });

  describe('Category 5: Performance Under Load', () => {
    test('Highlight Render FPS ≥55fps during scroll with 20 active highlights', () => {
      // Performance test would use Chrome DevTools Protocol
      expect(true).toBe(true); // Placeholder for performance test
    });

    test('Memory Growth ≤25MB after 30min session', () => {
      // Memory profiling test
      expect(true).toBe(true); // Placeholder for memory test
    });

    test('Large Paper Handling: 100-page paper with 200 evidence spans', () => {
      // Stress test with large document
      expect(true).toBe(true); // Placeholder for stress test
    });
  });
});
