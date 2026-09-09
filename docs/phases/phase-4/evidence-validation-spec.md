# Phase 4 Evidence Validation Specification

## Overview

This specification defines the evidence grounding validator that enforces verifiable provenance at the span level. It addresses Phase 1 Critical Finding #1 (fabricated evidence).

## Validation Invariants

The EvidenceValidator enforces three core invariants:

### Invariant 1: Excerpt Verifiability

Every evidence span's excerpt must match verbatim text at specified character offsets within the source chunk.

```typescript
const excerptInChunk = chunk.text.substring(span.startChar, span.endChar);
if (excerptInChunk !== span.excerpt) {
  // VALIDATION FAILURE: EXCERPT_MISMATCH
}
```

**Rationale:** Prevents LLM hallucination of non-existent text.

### Invariant 2: Chunk ID Integrity

All evidence spans must reference the correct chunk ID — no cross-chunk contamination.

```typescript
if (span.chunkId !== chunk.id) {
  // VALIDATION FAILURE: SPAN_CHUNK_MISMATCH
}
```

**Rationale:** Ensures evidence is traceable to correct source location.

### Invariant 3: Entity Reference Validity

All relation endpoints must reference entities extracted in the same chunk or previously validated chunks.

```typescript
const entityIds = new Set(entities.map(e => e.id));
if (!entityIds.has(relation.sourceEntityId)) {
  // VALIDATION FAILURE: ORPHAN_RELATION_SOURCE
}
```

**Rationale:** Prevents dangling references to non-existent entities.

## Error Types

| Type | Severity | Remediation |
|------|----------|-------------|
| `SPAN_CHUNK_MISMATCH` | Critical | Re-extraction with corrected chunk reference |
| `EXCERPT_MISMATCH` | Critical | Prompt tuning for exact excerpt extraction |
| `OFFSET_OUT_OF_BOUNDS` | Warning | Drop affected span, keep entity if other spans valid |
| `ORPHAN_RELATION_SOURCE` | Warning | Drop relation, preserve entities |
| `ORPHAN_RELATION_TARGET` | Warning | Drop relation, preserve entities |
| `INVALID_PAGE_NUMBER` | Info | Log for review, continue processing |
| `EMPTY_EVIDENCE` | Info | Trigger re-extraction with stricter prompting |

## Validator API

```typescript
import { EvidenceValidator } from './extraction/EvidenceValidator';

const validator = new EvidenceValidator();

const result = validator.validate(extractionResult, chunk);

if (!result.isValid) {
  const { critical, warning, info } = categorizeValidationErrors(result.errors);
  
  // Critical errors halt pipeline
  if (critical.length > 0) {
    throw new ExtractionValidationError(critical);
  }
  
  // Warnings logged, may trigger re-extraction
  if (warning.length > 0) {
    console.warn('Validation warnings:', warning);
  }
}
```

## Failure Mode Taxonomy

### Category 1: Data Corruption

**Symptoms:** Multiple `EXCERPT_MISMATCH` errors across different entities

**Root Cause:** Chunk text modified after extraction

**Remediation:**
1. Re-run extraction on current chunk state
2. Investigate chunking pipeline for mutation bugs

### Category 2: LLM Hallucination

**Symptoms:** High rate of `OFFSET_OUT_OF_BOUNDS` or fabricated excerpts

**Root Cause:** Model generating plausible but non-existent text

**Remediation:**
1. Lower temperature setting
2. Add stricter prompt instructions
3. Switch to provider with better instruction following

### Category 3: Schema Drift

**Symptoms:** `ExtractionSchemaError` on Zod validation

**Root Cause:** Provider output format changed

**Remediation:**
1. Check provider API version
2. Update JSON schema in provider
3. Roll back to previous prompt version

## Audit Log Format

All validation failures logged to structured audit log:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "chunkId": "c1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
  "paperId": "p1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
  "errorType": "EXCERPT_MISMATCH",
  "entityId": "e1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
  "expected": "Transformer architecture",
  "actual": "transformer model",
  "span": {
    "startChar": 45,
    "endChar": 67,
    "pageNumber": 3
  },
  "providerModel": "openai/gpt-4o",
  "promptVersion": "v1.2"
}
```

## Integration Points

### With Zod Validation

```typescript
// Order of operations:
// 1. Parse LLM response as JSON
// 2. Validate against Zod schema (structure check)
// 3. Run EvidenceValidator (content verification)
// 4. Write to database if both pass

try {
  const parsed = JSON.parse(llmResponse);
  const validated = validateExtractionResult(parsed);  // Zod
  const grounded = validator.validate(validated, chunk);  // Evidence
  
  if (grounded.isValid) {
    await writeToDatabase(validated);
  }
} catch (error) {
  // Handle appropriately
}
```

### With Phase 3 Chunks

Validator assumes Phase 3 chunk structure:
- `chunk.id` matches evidence span `chunkId`
- `chunk.text` contains verifiable text
- `chunk.startPage` / `chunk.endPage` define valid page range
- Character offsets are within `chunk.text.length`

## Performance Characteristics

Validator is pure functional code with no side effects:
- **Time Complexity:** O(n) where n = total evidence spans
- **Space Complexity:** O(m) where m = number of entities (for ID lookup)
- **Deterministic:** Same input always produces same output

## Testing Strategy

### Unit Tests

```typescript
describe('EvidenceValidator', () => {
  it('validates matching excerpts', () => {
    const chunk = { id: 'c1', text: 'Hello world', startPage: 1, endPage: 1 };
    const span = { chunkId: 'c1', startChar: 0, endChar: 5, pageNumber: 1, excerpt: 'Hello' };
    
    const result = validator.validate({ entities: [{ evidenceSpans: [span] }] }, chunk);
    expect(result.isValid).toBe(true);
  });
  
  it('detects excerpt mismatch', () => {
    const chunk = { id: 'c1', text: 'Hello world', startPage: 1, endPage: 1 };
    const span = { chunkId: 'c1', startChar: 0, endChar: 5, pageNumber: 1, excerpt: 'Wrong' };
    
    const result = validator.validate({ entities: [{ evidenceSpans: [span] }] }, chunk);
    expect(result.errors[0].type).toBe('EXCERPT_MISMATCH');
  });
});
```

### Integration Tests

Verify end-to-end flow with real LLM responses and Phase 3 chunks.

---

*This specification is part of Phase 4 deliverables. See docs/phases/phase-4/ for related documentation.*
