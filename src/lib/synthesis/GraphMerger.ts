/**
 * Phase 8: Graph Merger
 * Implements typed edge aggregation and cross-document graph merging
 * with type-specific strategies
 */

import { ExtractedEntity, ExtractedRelation } from '../extraction/schemas';
import { CanonicalEntity } from './types';
import { EntityNormalizer } from './EntityNormalizer';

export interface MergedNode {
  id: string;
  normalizedForm: string;
  type: string;
  paperCount: number;
  evidenceSpans: Array<{
    chunkId: string;
    startChar: number;
    endChar: number;
    pageNumber: number;
    excerpt: string;
    paperId: string;
  }>;
  confidence: number;
  paperIds: string[];
}

export interface MergedEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  paperCount: number;
  evidenceSpans: Array<{
    chunkId: string;
    startChar: number;
    endChar: number;
    pageNumber: number;
    excerpt: string;
    paperId: string;
  }>;
  isExplicit: boolean;
  hasConflict: boolean;
  metadata?: {
    conflicts?: ConflictInfo[];
  };
}

export interface ConflictInfo {
  type: 'direct_contradiction' | 'implicit_disagreement' | 'temporal_evolution' | 'scope_mismatch';
  paperIds: string[];
  evidenceWeights: number[];
  resolved?: boolean;
}

export interface MergedGraph {
  nodes: MergedNode[];
  edges: MergedEdge[];
  metadata: {
    paperIds: string[];
    nodeCount: number;
    edgeCount: number;
    mergedAt: string;
    registryVersion: string;
  };
}

type MergeStrategy = 'union' | 'preserve_all' | 'multi_paper_required' | 'transitive_closure';

const MERGE_STRATEGIES: Record<string, MergeStrategy> = {
  uses: 'union',
  evaluates_on: 'union',
  improves: 'union',
  extends: 'union',
  derives_from: 'transitive_closure',
  contradicts: 'preserve_all',
  co_occurs: 'multi_paper_required'
};

export class GraphMerger {
  private normalizer: EntityNormalizer;

  constructor(normalizer: EntityNormalizer) {
    this.normalizer = normalizer;
  }

  async merge(
    papers: Array<{
      paperId: string;
      entities: ExtractedEntity[];
      relations: ExtractedRelation[];
    }>,
    registryVersion: string
  ): Promise<MergedGraph> {
    const canonicalNodes = new Map<string, MergedNode>();
    const mergedEdges = new Map<string, MergedEdge>();
    const paperIds = papers.map(p => p.paperId);

    // Step 1: Normalize and deduplicate nodes
    for (const paper of papers) {
      for (const entity of paper.entities) {
        const resolution = await this.normalizer.resolve(entity, paper.paperId);
        const key = resolution.canonicalEntity.id;
        
        if (!canonicalNodes.has(key)) {
          canonicalNodes.set(key, {
            id: key,
            normalizedForm: resolution.canonicalEntity.normalizedForm,
            type: resolution.canonicalEntity.entityType,
            paperCount: 0,
            evidenceSpans: [],
            confidence: resolution.canonicalEntity.confidence,
            paperIds: []
          });
        }
        
        const node = canonicalNodes.get(key)!;
        node.paperCount++;
        node.paperIds.push(paper.paperId);
        
        // Aggregate evidence spans with paper attribution
        for (const span of entity.evidenceSpans) {
          node.evidenceSpans.push({
            ...span,
            paperId: paper.paperId
          });
        }
        
        node.confidence = Math.max(node.confidence, entity.confidence);
      }
    }

    // Step 2: Merge edges with type-specific strategies
    for (const paper of papers) {
      for (const rel of paper.relations) {
        const sourceResolution = await this.normalizer.resolve(
          { 
            ...rel, 
            type: 'concept' as any, // Placeholder - would use actual source entity
            normalizedForm: '',
            rawMentions: [],
            evidenceSpans: []
          }, 
          paper.paperId
        );
        
        // Simplified: In production, would resolve by entity ID lookup
        const sourceKey = rel.sourceEntityId;
        const targetKey = rel.targetEntityId;
        
        if (!canonicalNodes.has(sourceKey) || !canonicalNodes.has(targetKey)) {
          continue; // Skip unresolved entities
        }

        const edgeKey = `${sourceKey}|${targetKey}|${rel.type}`;
        const strategy = MERGE_STRATEGIES[rel.type] || 'union';

        if (strategy === 'union') {
          if (!mergedEdges.has(edgeKey)) {
            mergedEdges.set(edgeKey, {
              id: this.generateEdgeId(sourceKey, targetKey, rel.type),
              source: sourceKey,
              target: targetKey,
              type: rel.type,
              paperCount: 0,
              evidenceSpans: [],
              isExplicit: rel.isExplicitlyStated,
              hasConflict: false
            });
          }
          
          const edge = mergedEdges.get(edgeKey)!;
          edge.paperCount++;
          
          for (const span of rel.evidenceSpans) {
            edge.evidenceSpans.push({
              ...span,
              paperId: paper.paperId
            });
          }
          
          edge.isExplicit = edge.isExplicit || rel.isExplicitlyStated;
        } else if (strategy === 'preserve_all') {
          // For contradictions: always create separate edge per paper
          const uniqueEdgeKey = `${edgeKey}|${paper.paperId}`;
          mergedEdges.set(uniqueEdgeKey, {
            id: this.generateEdgeId(sourceKey, targetKey, rel.type, paper.paperId),
            source: sourceKey,
            target: targetKey,
            type: rel.type,
            paperCount: 1,
            evidenceSpans: rel.evidenceSpans.map(s => ({ ...s, paperId: paper.paperId })),
            isExplicit: rel.isExplicitlyStated,
            hasConflict: true,
            metadata: {
              conflicts: [{
                type: 'direct_contradiction',
                paperIds: [paper.paperId],
                evidenceWeights: [rel.confidence]
              }]
            }
          });
        } else if (strategy === 'multi_paper_required') {
          // co_occurs: only keep if present in ≥2 papers
          if (mergedEdges.has(edgeKey)) {
            const edge = mergedEdges.get(edgeKey)!;
            edge.paperCount++;
            
            for (const span of rel.evidenceSpans) {
              edge.evidenceSpans.push({
                ...span,
                paperId: paper.paperId
              });
            }
          } else {
            mergedEdges.set(edgeKey, {
              id: this.generateEdgeId(sourceKey, targetKey, rel.type),
              source: sourceKey,
              target: targetKey,
              type: rel.type,
              paperCount: 1,
              evidenceSpans: rel.evidenceSpans.map(s => ({ ...s, paperId: paper.paperId })),
              isExplicit: rel.isExplicitlyStated,
              hasConflict: false
            });
          }
        }
      }
    }

    // Step 3: Filter co_occurs edges to multi-paper only
    const filteredEdges = Array.from(mergedEdges.values()).filter(edge => {
      if (edge.type === 'co_occurs') {
        return edge.paperCount >= 2;
      }
      return true;
    });

    // Step 4: Detect conflicts
    const edgesWithConflicts = this.detectConflicts(filteredEdges, canonicalNodes);

    return {
      nodes: Array.from(canonicalNodes.values()),
      edges: edgesWithConflicts,
      metadata: {
        paperIds,
        nodeCount: canonicalNodes.size,
        edgeCount: filteredEdges.length,
        mergedAt: new Date().toISOString(),
        registryVersion
      }
    };
  }

  private detectConflicts(
    edges: MergedEdge[], 
    nodes: Map<string, MergedNode>
  ): MergedEdge[] {
    // Group edges by source-target pair (ignoring direction for contradiction detection)
    const edgeGroups = new Map<string, MergedEdge[]>();
    
    for (const edge of edges) {
      const forwardKey = `${edge.source}|${edge.target}`;
      const reverseKey = `${edge.target}|${edge.source}`;
      
      // Check for contradicts relations
      if (edge.type === 'contradicts') {
        const groupKey = [edge.source, edge.target].sort().join('|');
        if (!edgeGroups.has(groupKey)) {
          edgeGroups.set(groupKey, []);
        }
        edgeGroups.get(groupKey)!.push(edge);
      }
    }

    // Mark conflicting edges
    const resultEdges: MergedEdge[] = [];
    for (const edge of edges) {
      const forwardKey = `${edge.source}|${edge.target}`;
      const reverseKey = `${edge.target}|${edge.source}`;
      
      let hasConflict = edge.hasConflict;
      
      // Check if there's a contradicting relation
      for (const [groupKey, groupEdges] of edgeGroups.entries()) {
        if (groupKey.includes(edge.source) && groupKey.includes(edge.target)) {
          hasConflict = true;
          break;
        }
      }

      resultEdges.push({
        ...edge,
        hasConflict
      });
    }

    return resultEdges;
  }

  private generateEdgeId(
    source: string, 
    target: string, 
    type: string, 
    paperId?: string
  ): string {
    const base = `${source}:${target}:${type}`;
    if (paperId) {
      return `edge_${base}_${paperId}`;
    }
    return `edge_${this.hashString(base)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
