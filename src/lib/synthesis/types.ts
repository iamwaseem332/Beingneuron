/**
 * Phase 8: Entity Normalization Types and Interfaces
 * Canonical entity registry for multi-paper synthesis
 */

import { EntityType, EvidenceSpan } from '../extraction/schemas';

export interface CanonicalEntity {
  id: string;
  normalizedForm: string;
  entityType: EntityType;
  aliases: string[];
  description?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  curatedBy?: string;
  curationStatus: 'auto' | 'reviewed' | 'rejected';
}

export interface EntityMention {
  id: string;
  canonicalEntityId: string;
  paperId: string;
  chunkId: string;
  rawMention: string;
  evidenceSpan: EvidenceSpan;
  mentionConfidence: number;
  createdAt: string;
}

export interface NormalizationResult {
  canonicalEntity: CanonicalEntity;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'embedding' | 'new';
  matchScore: number;
  requiresReview: boolean;
}

export interface CurationQueueItem {
  mentionId: string;
  rawMention: string;
  paperTitle: string;
  suggestedCanonicalId?: string;
  suggestedNormalizedForm: string;
  matchScore: number;
  reason: string;
  createdAt: string;
}

export interface EntityRegistryConfig {
  fuzzyMatchThreshold: number;      // Default: 0.85
  reviewQueueThreshold: number;     // Default: 0.80
  embeddingSimilarityThreshold: number; // Default: 0.90
  minAliasLength: number;           // Default: 3
}
