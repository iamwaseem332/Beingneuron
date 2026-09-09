/**
 * Phase 4 — Evidence Grounding Validator
 * 
 * This validator enforces verifiable grounding at the span level before any
 * extraction result is accepted. It addresses Phase 1 Critical Finding #1
 * (fabricated evidence provenance).
 * 
 * Validation invariants:
 * 1. Every evidence span's excerpt matches verbatim text at specified char offsets
 * 2. All evidence spans reference the correct chunk ID
 * 3. All relation endpoints reference entities extracted in the same chunk
 * 
 * @see docs/phases/phase-4/evidence-validation-spec.md for failure mode taxonomy
 */

import { ChunkExtractionResult, ExtractedEntity, ExtractedRelation, EvidenceSpan } from './schemas';
import type { Chunk } from '../chunking/types';

/**
 * Types of validation errors that can occur
 */
export type ValidationErrorType =
  | 'SPAN_CHUNK_MISMATCH'    // Evidence span references wrong chunk
  | 'EXCERPT_MISMATCH'       // Excerpt doesn't match chunk text at offsets
  | 'OFFSET_OUT_OF_BOUNDS'   // Char offsets exceed chunk text length
  | 'ORPHAN_RELATION_SOURCE' // Relation source entity not found
  | 'ORPHAN_RELATION_TARGET' // Relation target entity not found
  | 'INVALID_PAGE_NUMBER'    // Page number doesn't match chunk pages
  | 'EMPTY_EVIDENCE'         // Entity/relation has no evidence spans;

/**
 * Individual validation error
 */
export interface ValidationError {
  /** Error type for categorization */
  type: ValidationErrorType;
  /** Human-readable message */
  message: string;
  /** Entity ID affected (if applicable) */
  entityId?: string;
  /** Relation ID affected (if applicable) */
  relationId?: string;
  /** The problematic evidence span */
  span?: EvidenceSpan;
  /** Expected value (for mismatches) */
  expected?: string;
  /** Actual value (for mismatches) */
  actual?: string;
}

/**
 * Result of validation operation
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
  /** ISO 8601 timestamp of validation */
  validatedAt: string;
}

/**
 * Evidence grounding validator
 * 
 * Pure functional class with no side effects — enables deterministic unit testing.
 */
export class EvidenceValidator {
  /**
   * Validate extraction result against source chunk
   * 
   * @param result - Extraction result to validate
   * @param chunk - Source chunk for verification
   * @returns Validation result with errors if any
   */
  validate(result: ChunkExtractionResult, chunk: Chunk): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Verify chunk ID matches
    if (result.chunkId !== chunk.id) {
      errors.push({
        type: 'SPAN_CHUNK_MISMATCH',
        message: `Extraction result chunkId ${result.chunkId} does not match source chunk ${chunk.id}`,
      });
      // If chunk IDs don't match, we can't verify evidence spans
      return {
        isValid: false,
        errors,
        validatedAt: new Date().toISOString()
      };
    }
    
    // Validate all entity evidence spans
    for (const entity of result.entities) {
      this.validateEntityEvidence(entity, chunk, errors);
    }
    
    // Validate all relation evidence spans and entity references
    for (const relation of result.relations) {
      this.validateRelationEvidence(relation, chunk, result.entities, errors);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      validatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Validate evidence spans for a single entity
   */
  private validateEntityEvidence(
    entity: ExtractedEntity, 
    chunk: Chunk, 
    errors: ValidationError[]
  ): void {
    if (entity.evidenceSpans.length === 0) {
      errors.push({
        type: 'EMPTY_EVIDENCE',
        message: `Entity ${entity.id} has no evidence spans`,
        entityId: entity.id
      });
      return;
    }
    
    for (const span of entity.evidenceSpans) {
      this.validateEvidenceSpan(span, chunk, entity.id, undefined, errors);
    }
  }
  
  /**
   * Validate evidence spans and entity references for a single relation
   */
  private validateRelationEvidence(
    relation: ExtractedRelation,
    chunk: Chunk,
    entities: ExtractedEntity[],
    errors: ValidationError[]
  ): void {
    // Validate evidence spans
    if (relation.evidenceSpans.length === 0) {
      errors.push({
        type: 'EMPTY_EVIDENCE',
        message: `Relation ${relation.id} has no evidence spans`,
        relationId: relation.id
      });
    } else {
      for (const span of relation.evidenceSpans) {
        this.validateEvidenceSpan(span, chunk, undefined, relation.id, errors);
      }
    }
    
    // Verify source entity exists
    const entityIds = new Set(entities.map(e => e.id));
    if (!entityIds.has(relation.sourceEntityId)) {
      errors.push({
        type: 'ORPHAN_RELATION_SOURCE',
        message: `Relation ${relation.id} references non-existent source entity ${relation.sourceEntityId}`,
        relationId: relation.id
      });
    }
    
    // Verify target entity exists
    if (!entityIds.has(relation.targetEntityId)) {
      errors.push({
        type: 'ORPHAN_RELATION_TARGET',
        message: `Relation ${relation.id} references non-existent target entity ${relation.targetEntityId}`,
        relationId: relation.id
      });
    }
  }
  
  /**
   * Validate a single evidence span against chunk text
   */
  private validateEvidenceSpan(
    span: EvidenceSpan,
    chunk: Chunk,
    entityId: string | undefined,
    relationId: string | undefined,
    errors: ValidationError[]
  ): void {
    // Verify chunk ID matches
    if (span.chunkId !== chunk.id) {
      errors.push({
        type: 'SPAN_CHUNK_MISMATCH',
        message: `Evidence span chunkId ${span.chunkId} does not match source chunk ${chunk.id}`,
        entityId,
        relationId,
        span
      });
      return;
    }
    
    // Verify offsets are within bounds
    if (span.startChar < 0 || span.startChar >= chunk.text.length) {
      errors.push({
        type: 'OFFSET_OUT_OF_BOUNDS',
        message: `startChar ${span.startChar} is out of bounds for chunk of length ${chunk.text.length}`,
        entityId,
        relationId,
        span
      });
      return;
    }
    
    if (span.endChar > chunk.text.length || span.endChar <= span.startChar) {
      errors.push({
        type: 'OFFSET_OUT_OF_BOUNDS',
        message: `endChar ${span.endChar} is invalid (must be > ${span.startChar} and ≤ ${chunk.text.length})`,
        entityId,
        relationId,
        span
      });
      return;
    }
    
    // Verify excerpt matches chunk text exactly
    const excerptInChunk = chunk.text.substring(span.startChar, span.endChar);
    if (excerptInChunk !== span.excerpt) {
      errors.push({
        type: 'EXCERPT_MISMATCH',
        message: 'Evidence span excerpt does not match chunk text at specified offsets',
        entityId,
        relationId,
        span,
        expected: span.excerpt,
        actual: excerptInChunk
      });
    }
    
    // Verify page number is within chunk's page range
    if (span.pageNumber < chunk.startPage || span.pageNumber > chunk.endPage) {
      errors.push({
        type: 'INVALID_PAGE_NUMBER',
        message: `Page number ${span.pageNumber} is outside chunk range [${chunk.startPage}, ${chunk.endPage}]`,
        entityId,
        relationId,
        span
      });
    }
  }
}

/**
 * Categorize validation errors by severity
 * 
 * @param errors - List of validation errors
 * @returns Errors grouped by severity
 */
export function categorizeValidationErrors(errors: ValidationError[]): {
  critical: ValidationError[];  // Must halt pipeline
  warning: ValidationError[];   // Can proceed with caution
  info: ValidationError[];      // Logging only
} {
  const critical: ValidationError[] = [];
  const warning: ValidationError[] = [];
  const info: ValidationError[] = [];
  
  for (const error of errors) {
    switch (error.type) {
      case 'SPAN_CHUNK_MISMATCH':
      case 'EXCERPT_MISMATCH':
        // Indicates potential data corruption or hallucination
        critical.push(error);
        break;
        
      case 'OFFSET_OUT_OF_BOUNDS':
      case 'ORPHAN_RELATION_SOURCE':
      case 'ORPHAN_RELATION_TARGET':
        // Can drop affected items but continue
        warning.push(error);
        break;
        
      case 'INVALID_PAGE_NUMBER':
      case 'EMPTY_EVIDENCE':
        // Metadata issues, log for review
        info.push(error);
        break;
    }
  }
  
  return { critical, warning, info };
}
