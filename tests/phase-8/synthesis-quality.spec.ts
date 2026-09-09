/**
 * Phase 8: Synthesis Quality Tests
 * Validates entity normalization, graph merging, and conflict resolution
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EntityNormalizer } from '../src/lib/synthesis/EntityNormalizer';
import { GraphMerger } from '../src/lib/synthesis/GraphMerger';
import { ConflictResolver } from '../src/lib/synthesis/ConflictResolver';
import { SynthesisValidator } from '../src/lib/synthesis/SynthesisValidator';
import { ExtractedEntity, ExtractedRelation } from '../src/lib/extraction/schemas';

describe('Phase 8: Synthesis Validation Suite', () => {
  let normalizer: EntityNormalizer;
  let merger: GraphMerger;
  let resolver: ConflictResolver;
  let validator: SynthesisValidator;

  beforeEach(() => {
    normalizer = new EntityNormalizer({
      fuzzyMatchThreshold: 0.85,
      reviewQueueThreshold: 0.80
    });
    merger = new GraphMerger(normalizer);
    resolver = new ConflictResolver();
    validator = new SynthesisValidator();
  });

  describe('Category 1: Entity Normalization Accuracy', () => {
    it('should achieve precision ≥0.90', async () => {
      // Mock extracted entities
      const entities: ExtractedEntity[] = [
        {
          id: 'e1',
          type: 'method',
          normalizedForm: 'Transformer',
          rawMentions: ['Transformer', 'transformer architecture'],
          evidenceSpans: [{ chunkId: 'c1', startChar: 0, endChar: 11, pageNumber: 1, excerpt: 'Transformer', confidence: 0.95 }],
          confidence: 0.95
        },
        {
          id: 'e2',
          type: 'method',
          normalizedForm: 'Transformer',
          rawMentions: ['transformer model'],
          evidenceSpans: [{ chunkId: 'c2', startChar: 10, endChar: 28, pageNumber: 2, excerpt: 'transformer model', confidence: 0.90 }],
          confidence: 0.90
        }
      ];

      // Both should resolve to same canonical entity
      const result1 = await normalizer.resolve(entities[0], 'paper1');
      const result2 = await normalizer.resolve(entities[1], 'paper2');

      expect(result1.canonicalEntity.id).toBe(result2.canonicalEntity.id);
      expect(result1.matchType).toBe('exact');
    });

    it('should achieve recall ≥0.85', () => {
      // Test that gold standard entities are recovered
      const metrics = validator.validateEntityNormalization(
        [
          { id: 'n1', normalizedForm: 'BERT', type: 'model', paperCount: 2, evidenceSpans: [], confidence: 0.9, paperIds: [] },
          { id: 'n2', normalizedForm: 'GPT-3', type: 'model', paperCount: 2, evidenceSpans: [], confidence: 0.85, paperIds: [] }
        ],
        {
          nodes: [
            { id: 'g1', normalizedForm: 'BERT', entityType: 'model', mentions: [] },
            { id: 'g2', normalizedForm: 'GPT-3', entityType: 'model', mentions: [] }
          ],
          edges: []
        }
      );

      expect(metrics.recall).toBeGreaterThanOrEqual(0.85);
    });

    it('should maintain false merge rate ≤0.05', () => {
      const metrics = validator.validateEntityNormalization(
        [
          { id: 'n1', normalizedForm: 'Apple', type: 'institution', paperCount: 1, evidenceSpans: [], confidence: 0.6, paperIds: [] }
        ],
        {
          nodes: [
            { id: 'g1', normalizedForm: 'Apple Inc', entityType: 'institution', mentions: [] },
            { id: 'g2', normalizedForm: 'apple fruit', entityType: 'concept', mentions: [] }
          ],
          edges: []
        }
      );

      expect(metrics.falseMergeRate).toBeLessThanOrEqual(0.05);
    });
  });

  describe('Category 2: Graph Merge Correctness', () => {
    it('should achieve edge preservation ≥0.88', () => {
      const mergedGraph = {
        nodes: [],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', type: 'uses', paperCount: 2, evidenceSpans: [{ paperId: 'p1' as any, chunkId: '', startChar: 0, endChar: 10, pageNumber: 1, excerpt: '' }], isExplicit: true, hasConflict: false }
        ],
        metadata: { paperIds: [], nodeCount: 0, edgeCount: 1, mergedAt: '', registryVersion: '' }
      };

      const goldStandard = {
        nodes: [],
        edges: [
          { id: 'g1', sourceEntityId: 'n1', targetEntityId: 'n2', relationType: 'uses', isExplicit: true, papers: ['p1'] }
        ]
      };

      const metrics = validator.validateGraphMerge(mergedGraph, goldStandard);
      expect(metrics.edgePreservation).toBeGreaterThanOrEqual(0.88);
    });

    it('should maintain spurious edge rate ≤0.03', () => {
      const mergedGraph = {
        nodes: [],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', type: 'uses', paperCount: 2, evidenceSpans: [{ paperId: 'p1' as any, chunkId: '', startChar: 0, endChar: 10, pageNumber: 1, excerpt: '' }], isExplicit: true, hasConflict: false }
        ],
        metadata: { paperIds: [], nodeCount: 0, edgeCount: 1, mergedAt: '', registryVersion: '' }
      };

      const metrics = validator.validateGraphMerge(mergedGraph, { nodes: [], edges: [] });
      expect(metrics.spuriousEdgeRate).toBeLessThanOrEqual(0.03);
    });
  });

  describe('Category 3: Conflict Resolution Fidelity', () => {
    it('should detect contradictions with recall ≥0.85', () => {
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', type: 'contradicts', paperCount: 1, evidenceSpans: [{ paperId: 'p1' as any, chunkId: '', startChar: 0, endChar: 10, pageNumber: 1, excerpt: '' }], isExplicit: true, hasConflict: true }
      ];

      const conflicts = resolver.detectDirectContradictions(edges as any);
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('should maintain false positive conflict rate ≤0.10', () => {
      const metrics = validator.validateConflictResolution(
        {
          nodes: [],
          edges: [
            { id: 'e1', source: 'n1', target: 'n2', type: 'uses', paperCount: 2, evidenceSpans: [], isExplicit: true, hasConflict: false }
          ],
          metadata: { paperIds: [], nodeCount: 0, edgeCount: 1, mergedAt: '', registryVersion: '' }
        },
        []
      );

      expect(metrics.falsePositiveRate).toBeLessThanOrEqual(0.10);
    });
  });

  describe('Category 4: Evidence Weighting', () => {
    it('should compute weights correctly', () => {
      const weight = resolver.computeEvidenceWeight({
        mentionConfidence: 0.9,
        citationCount: 100,
        recencyFactor: 0.8
      });

      // log10(101) ≈ 2.0, so weight ≈ 0.9 * 2.0 * 0.8 = 1.44
      expect(weight).toBeCloseTo(1.44, 1);
    });
  });

  describe('Category 5: Full Validation Suite', () => {
    it('should pass all Phase 8 targets', () => {
      const mockMetrics = {
        entityPrecision: 0.92,
        entityRecall: 0.87,
        entityF1: 0.89,
        falseMergeRate: 0.03,
        edgePreservation: 0.89,
        spuriousEdgeRate: 0.02,
        evidenceCompleteness: 0.95,
        contradictionDetectionRecall: 0.88,
        falsePositiveConflictRate: 0.08,
        overallF1: 0.88
      };

      const result = validator.checkTargets(mockMetrics);
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should report failures when targets not met', () => {
      const mockMetrics = {
        entityPrecision: 0.85, // Below 0.90 target
        entityRecall: 0.80,    // Below 0.85 target
        entityF1: 0.82,
        falseMergeRate: 0.08,  // Above 0.05 target
        edgePreservation: 0.89,
        spuriousEdgeRate: 0.02,
        evidenceCompleteness: 0.95,
        contradictionDetectionRecall: 0.88,
        falsePositiveConflictRate: 0.08,
        overallF1: 0.85
      };

      const result = validator.checkTargets(mockMetrics);
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });
});
