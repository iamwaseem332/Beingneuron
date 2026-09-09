/**
 * Phase 4 — Typed Extraction Schemas with Zod Enforcement
 * 
 * These schemas define the contract for LLM-based entity and relation extraction.
 * Every extraction result MUST pass Zod validation before database write or downstream consumption.
 * 
 * Key invariants enforced:
 * 1. Every entity/relation requires ≥1 evidence span (no orphaned extractions)
 * 2. Evidence spans reference valid chunk IDs and char offsets within chunk bounds
 * 3. Relation types distinguish explicit assertions from heuristic co-occurrences
 * 4. Normalized forms enable cross-chunk deduplication (Phase 8)
 * 5. Confidence scores enable downstream filtering
 * 
 * @see docs/phases/phase-4/extraction-schema-spec.md for field-level rationale
 * @see docs/phases/phase-2/database-schema.md for database constraints alignment
 */

import { z } from 'zod';

/**
 * Valid entity types aligned with Phase 2 database constraints
 * and Phase 3 annotation protocols
 */
export const EntityTypeEnum = z.enum([
  'concept',      // Core scientific concepts, techniques, theories
  'method',       // Methodologies, approaches, algorithms
  'dataset',      // Datasets, corpora, benchmarks
  'model',        // Trained models, architectures
  'author',       // Paper authors, researchers
  'institution',  // Universities, labs, organizations
  'claim',        // Scientific claims, hypotheses
  'result',       // Experimental results, findings
  'limitation'    // Acknowledged limitations, constraints
]);

/**
 * Valid relation types
 * 
 * Critical distinction: isExplicitlyStated differentiates between:
 * - true: The paper explicitly asserts this relationship
 * - false: Co-occurrence only, no explicit semantic connection claimed
 * 
 * This directly addresses Phase 1 Critical Finding #2 (meaningless edges from co-occurrence)
 */
export const RelationTypeEnum = z.enum([
  'uses',           // Entity A uses entity B
  'evaluates_on',   // Model/method evaluated on dataset
  'improves',       // Entity A improves upon entity B
  'contradicts',    // Entity A contradicts entity B
  'extends',        // Entity A extends entity B
  'derives_from',   // Entity A derives from entity B
  'co_occurs'       // Simple co-occurrence without explicit semantic relation
]);

/**
 * Evidence span schema — verifiable link to source text
 * 
 * Every evidence span must be verifiable by:
 * 1. chunkId exists in the parsed document
 * 2. startChar/endChar are within chunk text bounds
 * 3. excerpt matches chunk.text.substring(startChar, endChar) exactly
 */
export const EvidenceSpanSchema = z.object({
  /** UUID of the source chunk (must match Chunk.id from Phase 3) */
  chunkId: z.string().uuid(),
  /** Character offset from start of chunk text (0-indexed, inclusive) */
  startChar: z.number().int().nonnegative(),
  /** Character offset from start of chunk text (exclusive, must be > startChar) */
  endChar: z.number().int().positive(),
  /** 1-indexed page number in original PDF */
  pageNumber: z.number().int().positive(),
  /** Verbatim excerpt from chunk text (max 500 chars for storage efficiency) */
  excerpt: z.string().min(1).max(500),
  /** Extraction confidence 0–1 */
  confidence: z.number().min(0).max(1)
});

/**
 * Extracted entity schema
 * 
 * All fields required except sectionContext. Missing required fields
 * cause Zod validation failure — no partial entities accepted.
 */
export const ExtractedEntitySchema = z.object({
  /** Unique entity identifier (UUID) */
  id: z.string().uuid(),
  /** Entity type from EntityTypeEnum */
  type: EntityTypeEnum,
  /** Normalized/canonical form for deduplication (e.g., "Transformer" not "the transformer model") */
  normalizedForm: z.string().min(1).max(200),
  /** All surface forms/mentions found in text (at least 1) */
  rawMentions: z.array(z.string()).min(1),
  /** Evidence spans proving this entity exists in source text (≥1 required) */
  evidenceSpans: z.array(EvidenceSpanSchema).min(1),
  /** Optional section context (e.g., "Methods", "Results") */
  sectionContext: z.string().optional(),
  /** Overall confidence in this extraction 0–1 */
  confidence: z.number().min(0).max(1)
});

/**
 * Extracted relation schema
 * 
 * Relations must reference entities extracted in the same chunk or
 * previously validated chunks (via lookup table in EvidenceValidator).
 */
export const ExtractedRelationSchema = z.object({
  /** Unique relation identifier (UUID) */
  id: z.string().uuid(),
  /** Source entity ID (must exist in entities array or lookup table) */
  sourceEntityId: z.string().uuid(),
  /** Target entity ID (must exist in entities array or lookup table) */
  targetEntityId: z.string().uuid(),
  /** Relation type from RelationTypeEnum */
  type: RelationTypeEnum,
  /** Evidence spans supporting this relation (≥1 required) */
  evidenceSpans: z.array(EvidenceSpanSchema).min(1),
  /** 
   * Critical flag: Is this relation explicitly stated in text?
   * - true: Paper explicitly asserts this relationship
   * - false: Inferred from co-occurrence only
   */
  isExplicitlyStated: z.boolean(),
  /** Overall confidence in this relation 0–1 */
  confidence: z.number().min(0).max(1)
});

/**
 * Metadata about the extraction process
 * 
 * Enables tracking extraction quality across prompt iterations,
 * cost monitoring, and reproducibility.
 */
export const ExtractionMetadataSchema = z.object({
  /** Provider/model used (e.g., "openai/gpt-4o", "anthropic/claude-3.5-sonnet") */
  model: z.string(),
  /** Prompt version for tracking improvements (e.g., "v1.2") */
  promptVersion: z.string(),
  /** ISO 8601 timestamp of extraction */
  timestamp: z.string().datetime(),
  /** Token usage for cost monitoring */
  tokenUsage: z.object({
    /** Input tokens consumed */
    input: z.number().int().nonnegative(),
    /** Output tokens generated */
    output: z.number().int().nonnegative()
  })
});

/**
 * Complete extraction result for a single chunk
 * 
 * This is the primary output of the LLM extraction provider.
 * Must pass Zod validation AND EvidenceValidator before database write.
 */
export const ChunkExtractionResultSchema = z.object({
  /** UUID of the extracted chunk (must match Chunk.id) */
  chunkId: z.string().uuid(),
  /** UUID of the parent paper */
  paperId: z.string().uuid(),
  /** Extracted entities from this chunk */
  entities: z.array(ExtractedEntitySchema),
  /** Extracted relations from this chunk */
  relations: z.array(ExtractedRelationSchema),
  /** Metadata about the extraction process */
  extractionMetadata: ExtractionMetadataSchema
});

// ============================================================================
// Type exports derived from schemas
// ============================================================================

export type EntityType = z.infer<typeof EntityTypeEnum>;
export type RelationType = z.infer<typeof RelationTypeEnum>;
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractedRelation = z.infer<typeof ExtractedRelationSchema>;
export type ExtractionMetadata = z.infer<typeof ExtractionMetadataSchema>;
export type ChunkExtractionResult = z.infer<typeof ChunkExtractionResultSchema>;

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Custom error class for schema validation failures
 * Includes detailed path information for debugging
 */
export class ExtractionSchemaError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ExtractionSchemaError';
  }
}

/**
 * Validate extraction result against Zod schema
 * 
 * @param data - Raw extraction result from LLM provider
 * @returns Validated ChunkExtractionResult
 * @throws ExtractionSchemaError if validation fails
 */
export function validateExtractionResult(data: unknown): ChunkExtractionResult {
  const result = ChunkExtractionResultSchema.safeParse(data);
  
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ExtractionSchemaError(
      `Extraction schema validation failed: ${firstError.message}`,
      firstError.path.join('.'),
      firstError.code
    );
  }
  
  return result.data;
}

/**
 * Validate entity array against schema
 * 
 * @param entities - Raw entity array
 * @returns Validated ExtractedEntity[]
 * @throws ExtractionSchemaError if validation fails
 */
export function validateEntities(entities: unknown): ExtractedEntity[] {
  const result = z.array(ExtractedEntitySchema).safeParse(entities);
  
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ExtractionSchemaError(
      `Entity validation failed: ${firstError.message}`,
      firstError.path.join('.'),
      firstError.code
    );
  }
  
  return result.data;
}

/**
 * Validate relation array against schema
 * 
 * @param relations - Raw relation array
 * @returns Validated ExtractedRelation[]
 * @throws ExtractionSchemaError if validation fails
 */
export function validateRelations(relations: unknown): ExtractedRelation[] {
  const result = z.array(ExtractedRelationSchema).safeParse(relations);
  
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ExtractionSchemaError(
      `Relation validation failed: ${firstError.message}`,
      firstError.path.join('.'),
      firstError.code
    );
  }
  
  return result.data;
}
