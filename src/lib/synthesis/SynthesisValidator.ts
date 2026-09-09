/**
 * Phase 8: Synthesis Validation Suite
 * Validates entity normalization, graph merging, and conflict resolution
 * against gold standard multi-paper corpus
 */

import { ExtractedEntity, ExtractedRelation } from '../extraction/schemas';
import { MergedGraph, MergedNode, MergedEdge } from './GraphMerger';
import { CanonicalEntity } from './types';

export interface GoldStandardEntity {
  id: string;
  normalizedForm: string;
  entityType: string;
  mentions: Array<{
    paperId: string;
    rawMention: string;
    chunkId: string;
    startChar: number;
    endChar: number;
  }>;
}

export interface GoldStandardRelation {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  isExplicit: boolean;
  papers: string[];
}

export interface GoldStandardMergedGraph {
  nodes: GoldStandardEntity[];
  edges: GoldStandardRelation[];
}

export interface ValidationMetrics {
  // Entity Normalization
  entityPrecision: number;
  entityRecall: number;
  entityF1: number;
  falseMergeRate: number;
  
  // Graph Merge
  edgePreservation: number;
  spuriousEdgeRate: number;
  evidenceCompleteness: number;
  
  // Conflict Resolution
  contradictionDetectionRecall: number;
  falsePositiveConflictRate: number;
  
  // Overall
  overallF1: number;
}

export class SynthesisValidator {
  /**
   * Compute entity normalization accuracy
   */
  validateEntityNormalization(
    mergedNodes: MergedNode[],
    goldStandard: GoldStandardMergedGraph
  ): { precision: number; recall: number; f1: number; falseMergeRate: number } {
    // True Positives: merged entities that correctly group all mentions of same concept
    let tp = 0;
    // False Positives: merged entities that incorrectly combine distinct concepts
    let fp = 0;
    // False Negatives: gold standard entities not recovered
    let fn = 0;
    // False Merges: distinct concepts incorrectly merged
    let falseMerges = 0;
    
    const goldByNormalized = new Map<string, GoldStandardEntity>();
    for (const gold of goldStandard.nodes) {
      goldByNormalized.set(gold.normalizedForm.toLowerCase(), gold);
    }
    
    for (const merged of mergedNodes) {
      const goldMatch = goldByNormalized.get(merged.normalizedForm.toLowerCase());
      
      if (goldMatch) {
        // Check if all gold mentions are covered
        const goldMentionKeys = new Set(
          goldMatch.mentions.map(m => `${m.paperId}:${m.chunkId}:${m.startChar}`)
        );
        
        const mergedMentionKeys = new Set(
          merged.evidenceSpans.map(s => `${s.paperId}:${s.chunkId}:${s.startChar}`)
        );
        
        const coveredMentions = [...goldMentionKeys].filter(k => mergedMentionKeys.has(k)).length;
        
        if (coveredMentions >= goldMentionKeys.size * 0.8) {
          tp++;
        } else {
          fp++; // Partial match counts as false positive
        }
      } else {
        // Check if this might be a false merge
        if (merged.paperCount > 1 && merged.evidenceSpans.length > 5) {
          falseMerges++;
        }
        fp++;
      }
    }
    
    // Count false negatives
    for (const gold of goldStandard.nodes) {
      const hasMatch = mergedNodes.some(
        m => m.normalizedForm.toLowerCase() === gold.normalizedForm.toLowerCase()
      );
      if (!hasMatch) {
        fn++;
      }
    }
    
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const falseMergeRate = falseMerges / mergedNodes.length || 0;
    
    return { precision, recall, f1, falseMergeRate };
  }

  /**
   * Validate graph merge correctness
   */
  validateGraphMerge(
    mergedGraph: MergedGraph,
    goldStandard: GoldStandardMergedGraph
  ): { 
    edgePreservation: number; 
    spuriousEdgeRate: number; 
    evidenceCompleteness: number 
  } {
    // Edge Preservation: % of gold-standard explicit relations present
    let preservedEdges = 0;
    let totalGoldEdges = goldStandard.edges.length;
    
    const mergedEdgeKeys = new Set(
      mergedGraph.edges.map(e => `${e.source}|${e.target}|${e.type}`)
    );
    
    for (const goldEdge of goldStandard.edges) {
      const key = `${goldEdge.sourceEntityId}|${goldEdge.targetEntityId}|${goldEdge.relationType}`;
      if (mergedEdgeKeys.has(key)) {
        preservedEdges++;
      }
    }
    
    // Spurious Edges: % of merged edges not supported by any source paper
    let spuriousEdges = 0;
    for (const mergedEdge of mergedGraph.edges) {
      if (mergedEdge.paperCount === 0 || mergedEdge.evidenceSpans.length === 0) {
        spuriousEdges++;
      }
    }
    
    // Evidence Completeness: % of merged edges retaining all source evidence spans
    let completeEvidence = 0;
    for (const mergedEdge of mergedGraph.edges) {
      // Simplified: check if edge has multiple evidence spans
      if (mergedEdge.evidenceSpans.length >= mergedEdge.paperCount) {
        completeEvidence++;
      }
    }
    
    return {
      edgePreservation: preservedEdges / totalGoldEdges || 0,
      spuriousEdgeRate: spuriousEdges / mergedGraph.edges.length || 0,
      evidenceCompleteness: completeEvidence / mergedGraph.edges.length || 0
    };
  }

  /**
   * Validate conflict detection
   */
  validateConflictResolution(
    mergedGraph: MergedGraph,
    goldStandardConflicts: Array<{ type: string; paperIds: string[] }>
  ): { detectionRecall: number; falsePositiveRate: number } {
    const detectedConflicts = mergedGraph.edges.filter(e => e.hasConflict);
    
    // Detection Recall
    let truePositives = 0;
    for (const goldConflict of goldStandardConflicts) {
      const hasDetection = detectedConflicts.some(edge => {
        const edgePapers = new Set(edge.evidenceSpans.map(s => s.paperId));
        const goldPapers = new Set(goldConflict.paperIds);
        return [...goldPapers].some(p => edgePapers.has(p));
      });
      
      if (hasDetection) {
        truePositives++;
      }
    }
    
    // False Positive Rate
    const falsePositives = detectedConflicts.filter(edge => {
      return !goldStandardConflicts.some(gc => 
        gc.paperIds.some(pid => edge.evidenceSpans.some(s => s.paperId === pid))
      );
    }).length;
    
    return {
      detectionRecall: truePositives / goldStandardConflicts.length || 0,
      falsePositiveRate: falsePositives / detectedConflicts.length || 0
    };
  }

  /**
   * Run full validation suite
   */
  runFullValidation(
    mergedGraph: MergedGraph,
    goldStandard: GoldStandardMergedGraph,
    goldStandardConflicts: Array<{ type: string; paperIds: string[] }> = []
  ): ValidationMetrics {
    const entityMetrics = this.validateEntityNormalization(
      mergedGraph.nodes,
      goldStandard
    );
    
    const mergeMetrics = this.validateGraphMerge(mergedGraph, goldStandard);
    
    const conflictMetrics = this.validateConflictResolution(
      mergedGraph,
      goldStandardConflicts
    );
    
    const overallF1 = (
      entityMetrics.f1 + 
      mergeMetrics.edgePreservation + 
      conflictMetrics.detectionRecall
    ) / 3;
    
    return {
      entityPrecision: entityMetrics.precision,
      entityRecall: entityMetrics.recall,
      entityF1: entityMetrics.f1,
      falseMergeRate: entityMetrics.falseMergeRate,
      edgePreservation: mergeMetrics.edgePreservation,
      spuriousEdgeRate: mergeMetrics.spuriousEdgeRate,
      evidenceCompleteness: mergeMetrics.evidenceCompleteness,
      contradictionDetectionRecall: conflictMetrics.detectionRecall,
      falsePositiveConflictRate: conflictMetrics.falsePositiveRate,
      overallF1
    };
  }

  /**
   * Check if validation passes Phase 8 targets
   */
  checkTargets(metrics: ValidationMetrics): { passed: boolean; failures: string[] } {
    const failures: string[] = [];
    
    if (metrics.entityPrecision < 0.90) {
      failures.push(`Entity Precision ${metrics.entityPrecision.toFixed(3)} < 0.90`);
    }
    if (metrics.entityRecall < 0.85) {
      failures.push(`Entity Recall ${metrics.entityRecall.toFixed(3)} < 0.85`);
    }
    if (metrics.falseMergeRate > 0.05) {
      failures.push(`False Merge Rate ${metrics.falseMergeRate.toFixed(3)} > 0.05`);
    }
    if (metrics.edgePreservation < 0.88) {
      failures.push(`Edge Preservation ${metrics.edgePreservation.toFixed(3)} < 0.88`);
    }
    if (metrics.spuriousEdgeRate > 0.03) {
      failures.push(`Spurious Edge Rate ${metrics.spuriousEdgeRate.toFixed(3)} > 0.03`);
    }
    if (metrics.contradictionDetectionRecall < 0.85) {
      failures.push(`Contradiction Detection ${metrics.contradictionDetectionRecall.toFixed(3)} < 0.85`);
    }
    if (metrics.falsePositiveConflictRate > 0.10) {
      failures.push(`False Positive Conflict Rate ${metrics.falsePositiveConflictRate.toFixed(3)} > 0.10`);
    }
    
    return {
      passed: failures.length === 0,
      failures
    };
  }
}
