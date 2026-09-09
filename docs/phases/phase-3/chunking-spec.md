# Phase 3: Chunking Specification

## Executive Summary

This document specifies the Structure-Aware Chunking Engine implemented in Phase 3 of the BeingNeuron Synapse improvement initiative. The engine transforms parsed documents into semantically coherent chunks that preserve document structure, atomic units (tables/formulas), and evidence traceability.

**Implementation**: `src/lib/chunking/StructureChunker.ts`  
**Type Definitions**: `src/lib/chunking/types.ts`  
**Status**: ✅ Complete - Ready for Functional Validation Suite

---

## 1. Design Principles

### 1.1 Semantic Coherence Over Fixed Size

Unlike the legacy fixed-size chunking (~1400 characters) that severed semantic units mid-sentence and mid-paragraph, the structure-aware approach respects natural document boundaries:

- **Section boundaries** define primary chunk groups
- **Paragraph breaks** define secondary split points
- **Atomic units** (tables, formulas) are never split

### 1.2 Hierarchical Metadata

Each chunk carries hierarchical context enabling downstream consumers to:
- Filter by section type (Introduction vs Methods vs Results)
- Navigate parent-child relationships between chunks
- Weight evidence by structural importance

### 1.3 Evidence Traceability

Every character in every chunk maps back to exact source coordinates via `EvidenceSpan` objects containing:
- Character offsets from document start
- Page numbers
- Source block identifiers
- Optional bounding boxes

### 1.4 Deterministic Idempotency

Chunk IDs are generated via SHA-256 hash of `(paperId, sectionId, sequenceIndex)` ensuring:
- Same input always produces same chunk IDs
- Re-processing doesn't create duplicates
- Cache keys are stable across runs

---

## 2. Three-Level Chunking Algorithm

### Level 1: Section-Based Primary Chunks

**Input**: Parsed document with section hierarchy from parser adapter

**Process**:
1. Flatten section hierarchy into ordered list
2. For each section, collect all text blocks within page range `[startPage, endPage]`
3. Associate tables and formulas overlapping section pages

**Output**: Section contexts containing:
```typescript
{
  id: string;
  title: string;
  level: number;
  textBlocks: TextBlockWithMetadata[];
  tables: ExtractedTable[];
  formulas: ExtractedFormula[];
}
```

**Rationale**: Sections represent author-intended topical divisions. Keeping all content from "Methods" together preserves semantic coherence for entity extraction.

### Level 2: Subsection-Aware Secondary Splits

**Input**: Section context with text blocks

**Process**:
1. Iterate through text blocks accumulating token count
2. When `currentTokens + nextBlockTokens > maxTokens`:
   - Finalize current chunk
   - Apply overlap logic (carry last N tokens to next chunk)
   - Start new chunk at paragraph boundary (never mid-sentence)
3. Mark chunks containing tables/formulas as `containsTable`/`containsFormula`

**Configuration**:
```typescript
{
  maxTokens: 2000,      // Default target
  minTokens: 500,       // Minimum acceptable
  overlapTokens: 100,   // Context carry-over
}
```

**Output**: Ordered chunks within section with metadata:
```typescript
{
  id: "chunk_abc123",
  sectionTitle: "3. Methods",
  sectionLevel: 1,
  sequence: 0,
  text: "...",
  tokenCount: 1847,
  containsTable: true,
  embeddedTables: [...],
  evidenceSpans: [...]
}
```

**Rationale**: Large sections (e.g., "Related Work" spanning 8 pages) must be split for LLM context windows, but splits should occur at natural boundaries.

### Level 3: Semantic Boundary Detection Fallback

**Trigger**: No structural cues available (dense prose without headings)

**Process**:
1. Compute TF-IDF vectors for adjacent sentences
2. Calculate cosine similarity between sentence `i` and `i+1`
3. Insert chunk break where similarity < 0.3 threshold
4. Adjust break point to nearest paragraph boundary

**Note**: Current implementation uses simpler heuristics; TF-IDF enhancement deferred until gold corpus validation confirms need.

---

## 3. Atomic Unit Preservation

### 3.1 Tables

**Rule**: Tables are NEVER split across chunks.

**Implementation**:
```typescript
if (config.preserveAtomicUnits && containsTable) {
  chunk.embeddedTables = overlappingTables;
}
```

**Behavior**:
- If table fits within chunk token limit: include inline
- If table exceeds limit: still keep intact in single chunk (may exceed `maxTokens`)
- Downstream consumers can choose to reference table separately

### 3.2 Formulas

**Rule**: Formulas are NEVER split across chunks.

**Implementation**:
```typescript
if (config.preserveAtomicUnits && containsFormula) {
  chunk.embeddedFormulas = overlappingFormulas;
}
```

**Rationale**: Splitting a formula destroys its mathematical meaning. Better to have slightly oversized chunks than broken equations.

---

## 4. Configuration Parameters

### 4.1 ChunkConfig Interface

```typescript
interface ChunkConfig {
  /** Maximum tokens per chunk (default: 2000) */
  maxTokens: number;
  
  /** Minimum tokens per chunk (default: 500) */
  minTokens: number;
  
  /** Tokens to overlap between consecutive chunks (default: 100) */
  overlapTokens: number;
  
  /** Whether to preserve atomic units like tables/formulas (default: true) */
  preserveAtomicUnits: boolean;
  
  /** Token estimation method: 'approximate' (chars/4) or 'tiktoken' */
  tokenEstimationMethod: 'approximate' | 'tiktoken';
}
```

### 4.2 Tuning Guidance

| Parameter | Increase If... | Decrease If... |
|-----------|----------------|----------------|
| `maxTokens` | Entity extraction needs broader context | LLM context window is limited |
| `minTokens` | Too many tiny fragments | Chunks are too coarse |
| `overlapTokens` | Cross-chunk references are missed | Redundant processing cost is high |
| `preserveAtomicUnits` | Tables/formulas are critical | Memory constraints are tight |

---

## 5. Validation Invariants

The chunking engine enforces five invariants, validated automatically:

### Invariant 1: Reconstruction

**Rule**: Concatenated chunk texts must equal original document text (modulo whitespace normalization).

**Validation**:
```typescript
const reconstructed = chunks.map(c => c.text).join(' ');
const original = document.readingOrder.map(b => b.text).join(' ');
assert(normalize(reconstructed) === normalize(original));
```

### Invariant 2: Token Limits

**Rule**: No chunk should exceed `maxTokens * 1.1` (10% tolerance for atomic units).

**Validation**: Per-chunk token count check with warning-level errors.

### Invariant 3: Evidence Completeness

**Rule**: Every non-empty chunk must have at least one evidence span.

**Validation**:
```typescript
for (const chunk of chunks) {
  assert(chunk.evidenceSpans.length > 0 || chunk.text.length === 0);
}
```

### Invariant 4: Atomic Unit Integrity

**Rule**: Tables and formulas must appear entirely within single chunks.

**Validation**: Cross-reference chunk boundaries with atomic unit page spans.

### Invariant 5: Sequence Ordering

**Rule**: Chunk sequences within a section must be contiguous starting from 0.

**Validation**:
```typescript
const sequences = sectionChunks.map(c => c.sequence);
assert(sequences.every((s, i) => s === i));
```

---

## 6. Database Integration

### 6.1 Schema Updates (Phase 2)

The `chunks` table includes these columns for hierarchical metadata:

```sql
ALTER TABLE chunks ADD COLUMN section_title TEXT;
ALTER TABLE chunks ADD COLUMN section_level INTEGER;
ALTER TABLE chunks ADD COLUMN contains_table BOOLEAN DEFAULT FALSE;
ALTER TABLE chunks ADD COLUMN contains_formula BOOLEAN DEFAULT FALSE;
ALTER TABLE chunks ADD COLUMN parent_chunk_id UUID REFERENCES chunks(id);
```

### 6.2 Indexes

```sql
CREATE INDEX idx_chunks_paper_section ON chunks(paper_id, section_level);
CREATE INDEX idx_chunks_sequence ON chunks(paper_id, sequence);
```

### 6.3 Backward Compatibility View

For legacy consumers expecting flat chunk structure:

```sql
CREATE VIEW chunks_flat AS
SELECT 
  id, paper_id, sequence, text, token_count,
  start_page, end_page,
  json_build_object(
    'sectionTitle', section_title,
    'sectionLevel', section_level,
    'containsTable', contains_table,
    'containsFormula', contains_formula
  ) as metadata
FROM chunks;
```

---

## 7. Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Chunking latency (100-page paper) | ≤5s | Edge Function execution time |
| Memory peak | ≤50MB | Supabase function metrics |
| Reconstruction validity | 100% | Automated test assertion |
| Atomic unit preservation | 100% | Gold corpus comparison |
| Section boundary alignment | ≥90% | Manual review of 100 chunks |

---

## 8. Usage Examples

### Basic Chunking

```typescript
import { createChunkingEngine } from '@/lib/chunking/StructureChunker';
import { createParser } from '@/lib/parsers/ParserAdapter';

// Parse document
const parser = createParser({ llamaParseApiKey: process.env.LLAMAPARSE_KEY });
const parsedDoc = await parser.parse(pdfBuffer);

// Chunk document
const chunker = createChunkingEngine();
const result = await chunker.chunk(parsedDoc, paperId);

// Access chunks
for (const chunk of result.chunks) {
  console.log(`Chunk ${chunk.sequence}: ${chunk.sectionTitle}`);
  console.log(`Evidence: ${chunk.evidenceSpans.length} spans`);
}

// Check statistics
console.log(`Total chunks: ${result.statistics.totalChunks}`);
console.log(`Avg tokens: ${result.statistics.avgTokensPerChunk}`);
console.log(`Reconstruction valid: ${result.statistics.reconstructionValid}`);
```

### Custom Configuration

```typescript
const chunker = createChunkingEngine({
  maxTokens: 1500,      // Smaller chunks for specific LLM
  overlapTokens: 200,   // More context overlap
  preserveAtomicUnits: false, // Sacrifice quality for memory
});
```

### Querying Hierarchical Chunks

```typescript
// Get all chunks from "Methods" section
const methodsChunks = result.chunks.filter(
  c => c.sectionTitle.includes('Methods')
);

// Get chunks containing tables
const tableChunks = result.chunks.filter(c => c.containsTable);

// Navigate hierarchy (if parent pointers populated)
const childChunks = result.chunks.filter(
  c => c.parentChunkId === parentChunk.id
);
```

---

## 9. Error Handling

### ChunkingError Types

| Type | Severity | Description |
|------|----------|-------------|
| `RECONSTRUCTION_MISMATCH` | Error | Concatenated chunks don't match original |
| `TOKEN_LIMIT_EXCEEDED` | Warning | Chunk exceeds max tokens (tolerance applied) |
| `MISSING_EVIDENCE` | Error | Chunk has no evidence spans |
| `ATOMIC_UNIT_SPLIT` | Error | Table/formula split across chunks |

### Graceful Degradation

If validation errors occur:
1. Log errors with chunk IDs
2. Continue processing remaining sections
3. Return partial results with error list
4. Caller decides whether to accept or retry

---

## 10. Future Enhancements

1. **TF-IDF Semantic Boundaries**: Implement Level 3 fallback with actual embedding-based similarity
2. **Tiktoken Integration**: Replace approximate token counting with actual BPE tokenizer
3. **Citation-Aware Splitting**: Avoid splitting citation blocks
4. **Figure Caption Grouping**: Keep figure captions with their referenced figures

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-06  
**Author**: Phase 3 Implementation Team  
**Review Status**: ✅ Approved for Functional Validation
