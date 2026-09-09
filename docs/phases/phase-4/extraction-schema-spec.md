# Phase 4 Extraction Schema Specification

## Overview

This document defines the typed extraction schemas enforced via Zod for LLM-based entity and relation extraction. These schemas ensure type safety, evidence grounding, and compatibility with Phase 2 database constraints and Phase 3 annotation protocols.

## Schema Version

**Current Version:** v1.0  
**Last Updated:** 2024  
**Compatible With:** Phase 2 database schema, Phase 3 chunking structure

## Core Schemas

### EntityTypeEnum

Defines valid entity types aligned with Phase 2 database constraints:

```typescript
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
```

### RelationTypeEnum

Defines valid relation types with critical `isExplicitlyStated` distinction:

```typescript
export const RelationTypeEnum = z.enum([
  'uses',           // Entity A uses entity B
  'evaluates_on',   // Model/method evaluated on dataset
  'improves',       // Entity A improves upon entity B
  'contradicts',    // Entity A contradicts entity B
  'extends',        // Entity A extends entity B
  'derives_from',   // Entity A derives from entity B
  'co_occurs'       // Simple co-occurrence without explicit semantic relation
]);
```

### EvidenceSpanSchema

Verifiable link to source text — every span must be traceable:

```typescript
export const EvidenceSpanSchema = z.object({
  chunkId: z.string().uuid(),      // Must match Chunk.id from Phase 3
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  excerpt: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1)
});
```

**Field Rationale:**
- `chunkId`: Links evidence to specific chunk for verification
- `startChar`/`endChar`: Character offsets within chunk text (0-indexed)
- `pageNumber`: 1-indexed page in original PDF
- `excerpt`: Verbatim text at specified offsets (max 500 chars)
- `confidence`: Provider's certainty in this span (0–1)

### ExtractedEntitySchema

Complete entity record with mandatory evidence:

```typescript
export const ExtractedEntitySchema = z.object({
  id: z.string().uuid(),
  type: EntityTypeEnum,
  normalizedForm: z.string().min(1).max(200),
  rawMentions: z.array(z.string()).min(1),
  evidenceSpans: z.array(EvidenceSpanSchema).min(1),
  sectionContext: z.string().optional(),
  confidence: z.number().min(0).max(1)
});
```

**Invariants Enforced:**
1. ≥1 evidence span required (no orphaned entities)
2. Normalized form enables cross-chunk deduplication
3. Raw mentions capture all surface forms

### ExtractedRelationSchema

Semantic relationship with explicit/co-occurrence distinction:

```typescript
export const ExtractedRelationSchema = z.object({
  id: z.string().uuid(),
  sourceEntityId: z.string().uuid(),
  targetEntityId: z.string().uuid(),
  type: RelationTypeEnum,
  evidenceSpans: z.array(EvidenceSpanSchema).min(1),
  isExplicitlyStated: z.boolean(),
  confidence: z.number().min(0).max(1)
});
```

**Critical Field: `isExplicitlyStated`**
- `true`: Paper explicitly asserts this relationship
- `false`: Inferred from co-occurrence only

This directly addresses Phase 1 Critical Finding #2 (meaningless edges from co-occurrence).

### ChunkExtractionResultSchema

Complete extraction result for a single chunk:

```typescript
export const ChunkExtractionResultSchema = z.object({
  chunkId: z.string().uuid(),
  paperId: z.string().uuid(),
  entities: z.array(ExtractedEntitySchema),
  relations: z.array(ExtractedRelationSchema),
  extractionMetadata: ExtractionMetadataSchema
});
```

## Validation Examples

### Valid Entity Payload

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "method",
  "normalizedForm": "Transformer",
  "rawMentions": ["Transformer model", "transformer architecture"],
  "evidenceSpans": [
    {
      "chunkId": "c1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
      "startChar": 45,
      "endChar": 67,
      "pageNumber": 3,
      "excerpt": "Transformer model architecture",
      "confidence": 0.95
    }
  ],
  "sectionContext": "Methods",
  "confidence": 0.92
}
```

### Invalid Entity (Missing Evidence)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "method",
  "normalizedForm": "Transformer",
  "rawMentions": ["Transformer"],
  "evidenceSpans": [],  // ❌ VALIDATION ERROR: min(1) required
  "confidence": 0.9
}
```

### Valid Relation Payload

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "sourceEntityId": "550e8400-e29b-41d4-a716-446655440000",
  "targetEntityId": "550e8400-e29b-41d4-a716-446655440002",
  "type": "evaluates_on",
  "evidenceSpans": [
    {
      "chunkId": "c1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
      "startChar": 120,
      "endChar": 185,
      "pageNumber": 5,
      "excerpt": "We evaluate our Transformer model on the ImageNet dataset",
      "confidence": 0.98
    }
  ],
  "isExplicitlyStated": true,
  "confidence": 0.95
}
```

### Invalid Relation (Orphan Entity Reference)

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "sourceEntityId": "non-existent-id",  // ❌ VALIDATION ERROR: UUID format
  ...
}
```

## Schema Evolution Strategy

### Backward-Compatible Changes
- Adding optional fields with `.optional()`
- Extending enums with new values
- Increasing max lengths (`.max(500)` → `.max(600)`)

### Breaking Changes
Require major version bump and migration plan:
- Removing required fields
- Changing field types
- Modifying enum values

### Version Tracking

Schema version embedded in `extractionMetadata.promptVersion`:
```typescript
{
  model: "openai/gpt-4o",
  promptVersion: "v1.2",  // Tracks schema/prompt iteration
  timestamp: "2024-01-15T10:30:00Z",
  tokenUsage: { input: 1200, output: 650 }
}
```

## Migration Notes

### From Phase 2 Legacy Format

Phase 2 used loose JSON without evidence spans. Migration requires:
1. Re-extract entities with evidence grounding
2. Map old entity types to new enum values
3. Generate normalized forms from raw text

### To Future Versions

Breaking changes will require:
1. Export existing data with current schema
2. Apply transformation script
3. Re-validate against new schema
4. Import transformed data

## Implementation

See `src/lib/extraction/schemas.ts` for full Zod schema definitions and validation helpers:
- `validateExtractionResult()` — validates complete extraction
- `validateEntities()` — validates entity array
- `validateRelations()` — validates relation array
- `ExtractionSchemaError` — typed error with path information

---

*This specification is part of Phase 4 deliverables. See docs/phases/phase-4/ for related documentation.*
