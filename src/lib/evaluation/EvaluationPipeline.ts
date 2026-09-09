/**
 * Continuous Scientific Evaluation Pipeline
 * 
 * Runs nightly evaluation against gold standard corpus to detect
 * drift in extraction quality, entity normalization, and synthesis accuracy.
 */

import { Database } from '../types/database';
import { ExtractedEntity, ExtractedRelation, EvidenceSpan } from '../extraction/schemas';
import { CanonicalEntity } from '../synthesis/EntityNormalizer';

export interface EvaluationMetrics {
  // Entity extraction metrics
  entityPrecision: number;
  entityRecall: number;
  entityF1: number;
  
  // Relation extraction metrics
  relationSemanticPrecision: number;
  relationRecall: number;
  
  // Evidence metrics
  evidenceSpanAccuracy: number;
  evidenceProvenanceIntegrity: number;
  
  // Normalization metrics
  normalizationRecall: number;
  falseMergeRate: number;
  
  // Conflict detection metrics
  conflictDetectionRecall: number;
  conflictFalsePositiveRate: number;
  
  // Metadata
  computedAt: string;
  gitCommitHash: string;
  modelVersion: string;
  promptVersion: string;
  paperCount: number;
}

export interface DriftAlert {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  deviationPercent: number;
  severity: 'warning' | 'critical';
  triggeredAt: string;
}

export class EvaluationPipeline {
  private db: Database;
  private goldCorpusPath: string;
  
  constructor(db: Database, goldCorpusPath: string) {
    this.db = db;
    this.goldCorpusPath = goldCorpusPath;
  }
  
  /**
   * Run full evaluation pipeline against gold standard corpus
   */
  async runEvaluation(): Promise<EvaluationMetrics> {
    const goldStandard = await this.loadGoldCorpus();
    const extractedResults = await this.runExtractionOnCorpus(goldStandard.papers);
    
    const entityMetrics = this.computeEntityMetrics(
      goldStandard.entities,
      extractedResults.entities
    );
    
    const relationMetrics = this.computeRelationMetrics(
      goldStandard.relations,
      extractedResults.relations
    );
    
    const evidenceMetrics = this.computeEvidenceMetrics(
      goldStandard.evidenceSpans,
      extractedResults.evidenceSpans
    );
    
    const normalizationMetrics = this.computeNormalizationMetrics(
      goldStandard.canonicalEntities,
      extractedResults.normalizedEntities
    );
    
    const conflictMetrics = this.computeConflictMetrics(
      goldStandard.conflicts,
      extractedResults.detectedConflicts
    );
    
    const metrics: EvaluationMetrics = {
      ...entityMetrics,
      ...relationMetrics,
      ...evidenceMetrics,
      ...normalizationMetrics,
      ...conflictMetrics,
      computedAt: new Date().toISOString(),
      gitCommitHash: process.env.GIT_COMMIT_HASH || 'unknown',
      modelVersion: process.env.LLM_MODEL_VERSION || 'unknown',
      promptVersion: process.env.PROMPT_VERSION || 'unknown',
      paperCount: goldStandard.papers.length
    };
    
    await this.storeMetrics(metrics);
    await this.checkForDrift(metrics);
    
    return metrics;
  }
  
  /**
   * Compute entity extraction precision, recall, F1
   */
  private computeEntityMetrics(
    goldEntities: Array<{id: string; type: string; span: EvidenceSpan}>,
    extractedEntities: ExtractedEntity[]
  ): Pick<EvaluationMetrics, 'entityPrecision' | 'entityRecall' | 'entityF1'> {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    
    for (const extracted of extractedEntities) {
      const match = goldEntities.find(gold => 
        gold.type === extracted.type &&
        this.spansOverlap(gold.span, extracted.evidenceSpans[0])
      );
      
      if (match) {
        truePositives++;
      } else {
        falsePositives++;
      }
    }
    
    for (const gold of goldEntities) {
      const match = extractedEntities.find(extracted => 
        extracted.type === gold.type &&
        this.spansOverlap(gold.span, extracted.evidenceSpans)
      );
      
      if (!match) {
        falseNegatives++;
      }
    }
    
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    
    return { entityPrecision: precision, entityRecall: recall, entityF1: f1 };
  }
  
  /**
   * Compute relation semantic precision and recall
   */
  private computeRelationMetrics(
    goldRelations: Array<{source: string; target: string; type: string; isExplicit: boolean}>,
    extractedRelations: ExtractedRelation[]
  ): Pick<EvaluationMetrics, 'relationSemanticPrecision' | 'relationRecall'> {
    const explicitGold = goldRelations.filter(r => r.isExplicit);
    const explicitExtracted = extractedRelations.filter(r => r.isExplicitlyStated);
    
    let truePositives = 0;
    let falsePositives = 0;
    
    for (const extracted of explicitExtracted) {
      const match = explicitGold.find(gold => 
        gold.source === extracted.sourceEntityId &&
        gold.target === extracted.targetEntityId &&
        gold.type === extracted.type
      );
      
      if (match) {
        truePositives++;
      } else {
        falsePositives++;
      }
    }
    
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / explicitGold.length || 0;
    
    return { relationSemanticPrecision: precision, relationRecall: recall };
  }
  
  /**
   * Compute evidence span accuracy and provenance integrity
   */
  private computeEvidenceMetrics(
    goldSpans: EvidenceSpan[],
    extractedSpans: EvidenceSpan[]
  ): Pick<EvaluationMetrics, 'evidenceSpanAccuracy' | 'evidenceProvenanceIntegrity'> {
    let exactMatches = 0;
    let totalExtracted = extractedSpans.length;
    let provenanceViolations = 0;
    
    for (const extracted of extractedSpans) {
      const match = goldSpans.find(gold => 
        gold.chunkId === extracted.chunkId &&
        gold.startChar === extracted.startChar &&
        gold.endChar === extracted.endChar &&
        gold.excerpt === extracted.excerpt
      );
      
      if (match) {
        exactMatches++;
      }
      
      // Check provenance integrity - chunk must exist
      const chunkExists = this.verifyChunkExists(extracted.chunkId);
      if (!chunkExists) {
        provenanceViolations++;
      }
    }
    
    const accuracy = exactMatches / totalExtracted || 0;
    const integrity = 1 - (provenanceViolations / totalExtracted) || 1;
    
    return { 
      evidenceSpanAccuracy: accuracy, 
      evidenceProvenanceIntegrity: integrity 
    };
  }
  
  /**
   * Compute normalization recall and false merge rate
   */
  private computeNormalizationMetrics(
    goldCanonical: CanonicalEntity[],
    extractedNormalized: CanonicalEntity[]
  ): Pick<EvaluationMetrics, 'normalizationRecall' | 'falseMergeRate'> {
    let recoveredEntities = 0;
    let falseMerges = 0;
    
    for (const gold of goldCanonical) {
      const match = extractedNormalized.find(extracted => 
        extracted.normalizedForm === gold.normalizedForm &&
        extracted.entityType === gold.entityType
      );
      
      if (match) {
        recoveredEntities++;
        
        // Check if extracted merged distinct concepts
        if (this.hasIncorrectMerges(match, gold)) {
          falseMerges++;
        }
      }
    }
    
    const recall = recoveredEntities / goldCanonical.length || 0;
    const falseMergeRate = falseMerges / extractedNormalized.length || 0;
    
    return { normalizationRecall: recall, falseMergeRate: falseMergeRate };
  }
  
  /**
   * Compute conflict detection recall and false positive rate
   */
  private computeConflictMetrics(
    goldConflicts: Array<{type: string; entities: string[]}>,
    detectedConflicts: Array<{type: string; entities: string[]}>
  ): Pick<EvaluationMetrics, 'conflictDetectionRecall' | 'conflictFalsePositiveRate'> {
    let detectedTrueConflicts = 0;
    let falsePositiveConflicts = 0;
    
    for (const detected of detectedConflicts) {
      const match = goldConflicts.find(gold => 
        gold.type === detected.type &&
        gold.entities.every(e => detected.entities.includes(e))
      );
      
      if (match) {
        detectedTrueConflicts++;
      } else {
        falsePositiveConflicts++;
      }
    }
    
    const recall = detectedTrueConflicts / goldConflicts.length || 0;
    const falsePositiveRate = falsePositiveConflicts / detectedConflicts.length || 0;
    
    return { 
      conflictDetectionRecall: recall, 
      conflictFalsePositiveRate: falsePositiveRate 
    };
  }
  
  /**
   * Check for metric drift and trigger alerts
   */
  private async checkForDrift(current: EvaluationMetrics): Promise<void> {
    const recentMetrics = await this.getRecentMetrics(7); // Last 7 days
    
    const baseline = this.computeRollingAverage(recentMetrics);
    const alerts: DriftAlert[] = [];
    
    const metricThresholds: Record<string, number> = {
      entityF1: 0.05,
      relationSemanticPrecision: 0.05,
      evidenceSpanAccuracy: 0.05,
      normalizationRecall: 0.05,
      conflictDetectionRecall: 0.10
    };
    
    for (const [metricName, threshold] of Object.entries(metricThresholds)) {
      const currentValue = current[metricName as keyof EvaluationMetrics] as number;
      const baselineValue = baseline[metricName] || 0;
      const deviation = Math.abs(currentValue - baselineValue) / baselineValue;
      
      if (deviation > threshold) {
        alerts.push({
          metricName,
          currentValue,
          baselineValue,
          deviationPercent: deviation * 100,
          severity: deviation > threshold * 2 ? 'critical' : 'warning',
          triggeredAt: new Date().toISOString()
        });
      }
    }
    
    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }
  }
  
  /**
   * Store metrics in database for trend analysis
   */
  private async storeMetrics(metrics: EvaluationMetrics): Promise<void> {
    await this.db.from('evaluation_results').insert({
      metrics: metrics,
      computed_at: metrics.computedAt,
      git_commit_hash: metrics.gitCommitHash,
      model_version: metrics.modelVersion,
      prompt_version: metrics.promptVersion
    });
  }
  
  /**
   * Load gold standard corpus from storage
   */
  private async loadGoldCorpus(): Promise<{
    papers: any[];
    entities: any[];
    relations: any[];
    evidenceSpans: EvidenceSpan[];
    canonicalEntities: CanonicalEntity[];
    conflicts: any[];
  }> {
    // Implementation loads from S3/gold-corpus path
    return {
      papers: [],
      entities: [],
      relations: [],
      evidenceSpans: [],
      canonicalEntities: [],
      conflicts: []
    };
  }
  
  /**
   * Run extraction on corpus papers
   */
  private async runExtractionOnCorpus(papers: any[]): Promise<{
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    evidenceSpans: EvidenceSpan[];
    normalizedEntities: CanonicalEntity[];
    detectedConflicts: any[];
  }> {
    // Implementation runs extraction pipeline
    return {
      entities: [],
      relations: [],
      evidenceSpans: [],
      normalizedEntities: [],
      detectedConflicts: []
    };
  }
  
  private spansOverlap(span1: EvidenceSpan, span2: EvidenceSpan): boolean {
    return span1.chunkId === span2.chunkId &&
      !(span1.endChar < span2.startChar || span1.startChar > span2.endChar);
  }
  
  private verifyChunkExists(chunkId: string): boolean {
    // Implementation verifies chunk exists in database
    return true;
  }
  
  private hasIncorrectMerges(entity: CanonicalEntity, gold: CanonicalEntity): boolean {
    // Implementation checks for incorrect merges
    return false;
  }
  
  private async getRecentMetrics(days: number): Promise<EvaluationMetrics[]> {
    const { data } = await this.db
      .from('evaluation_results')
      .select('metrics')
      .gte('computed_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('computed_at', { ascending: false });
    
    return data?.map(d => d.metrics) || [];
  }
  
  private computeRollingAverage(metrics: EvaluationMetrics[]): Partial<EvaluationMetrics> {
    if (metrics.length === 0) return {};
    
    const keys = ['entityF1', 'relationSemanticPrecision', 'evidenceSpanAccuracy', 
                  'normalizationRecall', 'conflictDetectionRecall'] as const;
    
    const result: Partial<EvaluationMetrics> = {};
    
    for (const key of keys) {
      const sum = metrics.reduce((acc, m) => acc + (m[key] || 0), 0);
      result[key] = sum / metrics.length;
    }
    
    return result;
  }
  
  private async sendAlerts(alerts: DriftAlert[]): Promise<void> {
    // Implementation sends alerts via webhook to PagerDuty/Slack
    console.log('DRIFT ALERTS:', JSON.stringify(alerts, null, 2));
  }
}
