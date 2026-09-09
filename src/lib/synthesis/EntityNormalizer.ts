/**
 * Phase 8: Entity Normalizer
 * Implements fuzzy matching, alias lookup, and embedding-assisted disambiguation
 * for canonical entity registry
 */

import { supabase } from '../../supabase/client';
import { ExtractedEntity } from '../extraction/schemas';
import type { 
  CanonicalEntity, 
  EntityMention, 
  NormalizationResult, 
  CurationQueueItem,
  EntityRegistryConfig 
} from './types';

export { CanonicalEntity };

const DEFAULT_CONFIG: EntityRegistryConfig = {
  fuzzyMatchThreshold: 0.85,
  reviewQueueThreshold: 0.80,
  embeddingSimilarityThreshold: 0.90,
  minAliasLength: 3
};

export class EntityNormalizer {
  private config: EntityRegistryConfig;
  private cache: Map<string, NormalizationResult>;

  constructor(config: Partial<EntityRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
  }

  /**
   * Resolve an extracted entity to a canonical entity
   * Uses exact match → alias → fuzzy → embedding → create new
   */
  async resolve(entity: ExtractedEntity, paperId: string): Promise<NormalizationResult> {
    const cacheKey = `${entity.normalizedForm}:${entity.type}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Strategy 1: Exact match on normalized_form
    let result = await this.exactMatch(entity.normalizedForm, entity.type);
    if (result) {
      const normalizationResult: NormalizationResult = {
        canonicalEntity: result,
        matchType: 'exact',
        matchScore: 1.0,
        requiresReview: false
      };
      this.cache.set(cacheKey, normalizationResult);
      await this.linkMention(entity, paperId, result.id, 1.0);
      return normalizationResult;
    }

    // Strategy 2: Alias match
    result = await this.aliasMatch(entity.normalizedForm, entity.type);
    if (result) {
      const normalizationResult: NormalizationResult = {
        canonicalEntity: result,
        matchType: 'alias',
        matchScore: 0.95,
        requiresReview: false
      };
      this.cache.set(cacheKey, normalizationResult);
      await this.linkMention(entity, paperId, result.id, 0.95);
      return normalizationResult;
    }

    // Strategy 3: Fuzzy match
    const fuzzyResult = await this.fuzzyMatch(entity.normalizedForm, entity.type);
    if (fuzzyResult && fuzzyResult.score >= this.config.fuzzyMatchThreshold) {
      const requiresReview = fuzzyResult.score < this.config.reviewQueueThreshold;
      const normalizationResult: NormalizationResult = {
        canonicalEntity: fuzzyResult.entity,
        matchType: 'fuzzy',
        matchScore: fuzzyResult.score,
        requiresReview
      };
      this.cache.set(cacheKey, normalizationResult);
      await this.linkMention(entity, paperId, fuzzyResult.entity.id, fuzzyResult.score);
      return normalizationResult;
    }

    // Strategy 4: Embedding-assisted disambiguation (for ambiguous cases)
    const embeddingResult = await this.embeddingMatch(entity, paperId);
    if (embeddingResult && embeddingResult.similarity >= this.config.embeddingSimilarityThreshold) {
      const normalizationResult: NormalizationResult = {
        canonicalEntity: embeddingResult.entity,
        matchType: 'embedding',
        matchScore: embeddingResult.similarity,
        requiresReview: false
      };
      this.cache.set(cacheKey, normalizationResult);
      await this.linkMention(entity, paperId, embeddingResult.entity.id, embeddingResult.similarity);
      return normalizationResult;
    }

    // Strategy 5: Create new canonical entity
    const newEntity = await this.createCanonicalEntity(entity);
    const requiresReview = !fuzzyResult || fuzzyResult.score < this.config.reviewQueueThreshold;
    const normalizationResult: NormalizationResult = {
      canonicalEntity: newEntity,
      matchType: 'new',
      matchScore: 0.6, // Default confidence for auto-created
      requiresReview
    };
    this.cache.set(cacheKey, normalizationResult);
    await this.linkMention(entity, paperId, newEntity.id, 0.6);
    
    if (requiresReview) {
      await this.addToCurationQueue(entity, paperId, newEntity);
    }
    
    return normalizationResult;
  }

  private async exactMatch(normalizedForm: string, entityType: string): Promise<CanonicalEntity | null> {
    const { data, error } = await supabase
      .from('canonical_entities')
      .select('*')
      .eq('normalized_form', normalizedForm)
      .eq('entity_type', entityType)
      .single();

    if (error || !data) return null;
    return this.mapToCanonicalEntity(data);
  }

  private async aliasMatch(normalizedForm: string, entityType: string): Promise<CanonicalEntity | null> {
    const { data, error } = await supabase
      .from('canonical_entities')
      .select('*')
      .eq('entity_type', entityType)
      .contains('aliases', [normalizedForm])
      .single();

    if (error || !data) return null;
    return this.mapToCanonicalEntity(data);
  }

  private async fuzzyMatch(
    rawMention: string, 
    entityType: string
  ): Promise<{ entity: CanonicalEntity; score: number } | null> {
    // Get candidates of same type
    const { data: candidates } = await supabase
      .from('canonical_entities')
      .select('*')
      .eq('entity_type', entityType)
      .limit(50);

    if (!candidates || candidates.length === 0) return null;

    let bestMatch: { entity: CanonicalEntity; score: number } | null = null;

    for (const candidate of candidates) {
      const entity = this.mapToCanonicalEntity(candidate);
      const score = this.computeFuzzyScore(rawMention, entity);
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { entity, score };
      }
    }

    return bestMatch && bestMatch.score >= this.config.fuzzyMatchThreshold ? bestMatch : null;
  }

  private computeFuzzyScore(rawMention: string, entity: CanonicalEntity): number {
    const normalized = rawMention.toLowerCase().trim();
    const target = entity.normalizedForm.toLowerCase().trim();
    
    // Levenshtein distance component
    const levenshteinScore = this.levenshteinSimilarity(normalized, target);
    
    // Token overlap component
    const normalizedTokens = new Set(normalized.split(/\s+/));
    const targetTokens = new Set(target.split(/\s+/));
    const intersection = [...normalizedTokens].filter(t => targetTokens.has(t));
    const tokenOverlap = intersection.length / Math.max(normalizedTokens.size, targetTokens.size, 1);
    
    // Check aliases
    let aliasScore = 0;
    for (const alias of entity.aliases) {
      const aliasSim = this.levenshteinSimilarity(normalized, alias.toLowerCase());
      aliasScore = Math.max(aliasScore, aliasSim);
    }
    
    // Weighted combination
    return Math.max(
      levenshteinScore * 0.5 + tokenOverlap * 0.5,
      aliasScore
    );
  }

  private levenshteinSimilarity(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    
    const matrix: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return 1 - (matrix[s1.length][s2.length] / maxLen);
  }

  private async embeddingMatch(
    entity: ExtractedEntity, 
    paperId: string
  ): Promise<{ entity: CanonicalEntity; similarity: number } | null> {
    // Placeholder for embedding-based disambiguation
    // Would integrate with embedding API in production
    return null;
  }

  private async createCanonicalEntity(entity: ExtractedEntity): Promise<CanonicalEntity> {
    const { data, error } = await supabase
      .from('canonical_entities')
      .insert({
        normalized_form: entity.normalizedForm,
        entity_type: entity.type,
        aliases: entity.rawMentions.filter(m => m !== entity.normalizedForm),
        confidence: 0.6,
        curation_status: 'auto'
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapToCanonicalEntity(data);
  }

  private async linkMention(
    entity: ExtractedEntity,
    paperId: string,
    canonicalEntityId: string,
    confidence: number
  ): Promise<void> {
    const { error } = await supabase
      .from('entity_mentions')
      .insert({
        canonical_entity_id: canonicalEntityId,
        paper_id: paperId,
        chunk_id: entity.evidenceSpans[0]?.chunkId || '',
        raw_mention: entity.rawMentions[0],
        evidence_span: entity.evidenceSpans,
        mention_confidence: confidence
      });

    if (error) throw error;
  }

  private async addToCurationQueue(
    entity: ExtractedEntity,
    paperId: string,
    canonicalEntity: CanonicalEntity
  ): Promise<void> {
    // Queue item would be stored in a curation_queue table
    // Simplified for Phase 8
    console.log(`Added to curation queue: ${entity.normalizedForm} → ${canonicalEntity.normalizedForm}`);
  }

  private mapToCanonicalEntity(row: any): CanonicalEntity {
    return {
      id: row.id,
      normalizedForm: row.normalized_form,
      entityType: row.entity_type as any,
      aliases: row.aliases || [],
      description: row.description,
      confidence: parseFloat(row.confidence),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      curatedBy: row.curated_by,
      curationStatus: row.curation_status as 'auto' | 'reviewed' | 'rejected'
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
