/**
 * Phase 8: Conflict Resolver
 * Detects and resolves conflicts in multi-paper synthesis
 * with evidence weighting
 */

import { MergedEdge, MergedNode, ConflictInfo } from './GraphMerger';

export interface ConflictResolution {
  edgeId: string;
  conflictType: ConflictInfo['type'];
  resolution: 'preserve_both' | 'weight_by_evidence' | 'temporal_ordering' | 'split_entity';
  confidence: number;
  rationale: string;
}

export interface EvidenceWeightParams {
  mentionConfidence: number;
  citationCount: number;
  recencyFactor: number;
}

export class ConflictResolver {
  /**
   * Compute evidence weight for a paper's claim
   * Formula: mention_confidence × paper_citation_count × recency_factor
   */
  computeEvidenceWeight(params: EvidenceWeightParams): number {
    const { mentionConfidence, citationCount, recencyFactor } = params;
    
    // Normalize citation count (log scale to prevent dominance)
    const normalizedCitations = Math.log10(citationCount + 1);
    
    // Ensure all factors are in valid ranges
    const clampedConfidence = Math.max(0, Math.min(1, mentionConfidence));
    const clampedRecency = Math.max(0.1, Math.min(1, recencyFactor));
    
    return clampedConfidence * normalizedCitations * clampedRecency;
  }

  /**
   * Detect direct contradictions between edges
   * E.g., "Method X improves Y" vs "Method X degrades Y"
   */
  detectDirectContradictions(edges: MergedEdge[]): ConflictInfo[] {
    const contradictions: ConflictInfo[] = [];
    
    // Group by entity pairs
    const edgePairs = new Map<string, MergedEdge[]>();
    
    for (const edge of edges) {
      const key = [edge.source, edge.target].sort().join('|');
      if (!edgePairs.has(key)) {
        edgePairs.set(key, []);
      }
      edgePairs.get(key)!.push(edge);
    }
    
    // Look for opposing relations
    const opposingTypes = new Map<string, string>([
      ['improves', 'contradicts'],
      ['extends', 'contradicts'],
      ['uses', 'contradicts']
    ]);
    
    for (const [key, groupEdges] of edgePairs.entries()) {
      for (let i = 0; i < groupEdges.length; i++) {
        for (let j = i + 1; j < groupEdges.length; j++) {
          const edge1 = groupEdges[i];
          const edge2 = groupEdges[j];
          
          // Check for contradict relation type
          if (edge1.type === 'contradicts' || edge2.type === 'contradicts') {
            const allPaperIds = [
              ...new Set([...edge1.evidenceSpans.map(s => s.paperId), 
                         ...edge2.evidenceSpans.map(s => s.paperId)])
            ];
            
            const weights = [
              this.computeEvidenceWeight({
                mentionConfidence: edge1.evidenceSpans.length > 0 ? 0.9 : 0.5,
                citationCount: edge1.paperCount,
                recencyFactor: 1.0
              }),
              this.computeEvidenceWeight({
                mentionConfidence: edge2.evidenceSpans.length > 0 ? 0.9 : 0.5,
                citationCount: edge2.paperCount,
                recencyFactor: 1.0
              })
            ];
            
            contradictions.push({
              type: 'direct_contradiction',
              paperIds: allPaperIds,
              evidenceWeights: weights,
              resolved: false
            });
          }
        }
      }
    }
    
    return contradictions;
  }

  /**
   * Detect temporal evolution patterns
   * Older paper claims limitation L; newer paper addresses L
   */
  detectTemporalEvolution(
    edges: MergedEdge[], 
    nodes: Map<string, MergedNode>,
    paperMetadata: Map<string, { publishedAt: string; citationCount: number }>
  ): ConflictInfo[] {
    const evolutions: ConflictInfo[] = [];
    
    // Look for "addresses", "overcomes", "improves" relations
    const improvementEdges = edges.filter(e => 
      e.type === 'improves' || e.type === 'extends'
    );
    
    for (const edge of improvementEdges) {
      const paperIds = [...new Set(edge.evidenceSpans.map(s => s.paperId))];
      
      if (paperIds.length >= 2) {
        // Sort papers by date
        const sortedPapers = paperIds.sort((a, b) => {
          const metaA = paperMetadata.get(a);
          const metaB = paperMetadata.get(b);
          if (!metaA || !metaB) return 0;
          return new Date(metaA.publishedAt).getTime() - new Date(metaB.publishedAt).getTime();
        });
        
        evolutions.push({
          type: 'temporal_evolution',
          paperIds: sortedPapers,
          evidenceWeights: sortedPapers.map(pid => {
            const meta = paperMetadata.get(pid);
            return this.computeEvidenceWeight({
              mentionConfidence: 0.8,
              citationCount: meta?.citationCount || 0,
              recencyFactor: 1.0
            });
          }),
          resolved: false
        });
      }
    }
    
    return evolutions;
  }

  /**
   * Detect scope mismatches
   * Same entity name but different semantic scope
   */
  detectScopeMismatches(
    nodes: Map<string, MergedNode>,
    embeddingSimilarities: Map<string, number>
  ): ConflictInfo[] {
    const mismatches: ConflictInfo[] = [];
    
    // Group nodes by normalized form
    const nodeGroups = new Map<string, MergedNode[]>();
    for (const node of nodes.values()) {
      if (!nodeGroups.has(node.normalizedForm)) {
        nodeGroups.set(node.normalizedForm, []);
      }
      nodeGroups.get(node.normalizedForm)!.push(node);
    }
    
    // Check for low embedding similarity despite string match
    for (const [form, groupNodes] of nodeGroups.entries()) {
      if (groupNodes.length >= 2) {
        for (let i = 0; i < groupNodes.length; i++) {
          for (let j = i + 1; j < groupNodes.length; j++) {
            const key = `${groupNodes[i].id}|${groupNodes[j].id}`;
            const similarity = embeddingSimilarities.get(key) || 1.0;
            
            if (similarity < 0.7) {
              // Likely scope mismatch
              mismatches.push({
                type: 'scope_mismatch',
                paperIds: [...groupNodes[i].paperIds, ...groupNodes[j].paperIds],
                evidenceWeights: [groupNodes[i].confidence, groupNodes[j].confidence],
                resolved: false
              });
            }
          }
        }
      }
    }
    
    return mismatches;
  }

  /**
   * Resolve a conflict based on type and evidence weights
   */
  resolveConflict(
    conflict: ConflictInfo,
    edges: MergedEdge[]
  ): ConflictResolution {
    switch (conflict.type) {
      case 'direct_contradiction':
        return {
          edgeId: edges.find(e => e.hasConflict)?.id || '',
          conflictType: 'direct_contradiction',
          resolution: 'weight_by_evidence',
          confidence: Math.max(...conflict.evidenceWeights),
          rationale: 'Preserving both contradictory claims with evidence-weighted presentation'
        };
        
      case 'temporal_evolution':
        return {
          edgeId: edges[0]?.id || '',
          conflictType: 'temporal_evolution',
          resolution: 'temporal_ordering',
          confidence: 0.9,
          rationale: 'Ordering claims chronologically to show research progression'
        };
        
      case 'scope_mismatch':
        return {
          edgeId: '',
          conflictType: 'scope_mismatch',
          resolution: 'split_entity',
          confidence: 0.85,
          rationale: 'Splitting canonical entity due to semantic scope divergence'
        };
        
      case 'implicit_disagreement':
        return {
          edgeId: '',
          conflictType: 'implicit_disagreement',
          resolution: 'preserve_both',
          confidence: 0.7,
          rationale: 'Presenting alternative approaches without forced reconciliation'
        };
        
      default:
        return {
          edgeId: '',
          conflictType: conflict.type,
          resolution: 'preserve_both',
          confidence: 0.5,
          rationale: 'Default: preserve all evidence for human review'
        };
    }
  }

  /**
   * Generate conflict report for UI consumption
   */
  generateConflictReport(
    edges: MergedEdge[],
    nodes: Map<string, MergedNode>,
    paperMetadata?: Map<string, { publishedAt: string; citationCount: number }>,
    embeddingSimilarities?: Map<string, number>
  ): {
    conflicts: ConflictInfo[];
    resolutions: ConflictResolution[];
    summary: {
      totalConflicts: number;
      byType: Record<string, number>;
      unresolvedCount: number;
    };
  } {
    const allConflicts: ConflictInfo[] = [
      ...this.detectDirectContradictions(edges),
      ...(paperMetadata ? this.detectTemporalEvolution(edges, nodes, paperMetadata) : []),
      ...(embeddingSimilarities ? this.detectScopeMismatches(nodes, embeddingSimilarities) : [])
    ];
    
    const resolutions = allConflicts.map(conflict => 
      this.resolveConflict(conflict, edges)
    );
    
    const byType: Record<string, number> = {};
    for (const conflict of allConflicts) {
      byType[conflict.type] = (byType[conflict.type] || 0) + 1;
    }
    
    return {
      conflicts: allConflicts,
      resolutions,
      summary: {
        totalConflicts: allConflicts.length,
        byType,
        unresolvedCount: allConflicts.filter(c => !c.resolved).length
      }
    };
  }
}
