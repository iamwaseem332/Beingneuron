# Phase 4 Handoff to Phase 5

## Overview

This document defines the interface contracts and handoff protocol from Phase 4 (LLM-Based Structured Entity and Relation Extraction) to Phase 5 (Async Extraction Pipeline Orchestration).

## Completed Deliverables

Phase 4 provides Phase 5 with:

1. **Typed Extraction Schemas** (`src/lib/extraction/schemas.ts`)
   - Zod-validated entity and relation types
   - Evidence span requirements
   - Metadata tracking

2. **Provider Abstraction** (`src/lib/extraction/providers/`)
   - `ExtractionProvider` interface
   - OpenAI provider implementation
   - Fallback regex provider
   - Provider factory

3. **Evidence Validator** (`src/lib/extraction/EvidenceValidator.ts`)
   - Span-level verification
   - Error categorization
   - Audit logging

4. **Validation Framework** (`tests/phase-4/evaluate-extraction.ts`)
   - Gold standard comparison
   - Metric computation
   - Report generation

## Interface Contracts for Phase 5

### Input: ChunkExtractionResult

Phase 5 receives extraction results via queue messages:

```typescript
interface QueueMessage {
  paperId: string;
  chunkId: string;
  priority: number;
  retryCount: number;
}
```

### Output: Validated Extraction

Phase 5 produces:

```typescript
interface ExtractionJobResult {
  jobId: string;
  paperId: string;
  chunkId: string;
  status: 'completed' | 'failed' | 'partial';
  result?: ChunkExtractionResult;
  errors?: ValidationError[];
  metadata: {
    provider: string;
    promptVersion: string;
    durationMs: number;
    tokenUsage: { input: number; output: number };
    costUsd: number;
  };
}
```

## Integration Points

### 1. Queue Message Format

Phase 5 orchestrates parallel extraction via message queue:

```typescript
// Queue producer (Phase 5)
async function queueChunkForExtraction(chunk: Chunk): Promise<void> {
  await queue.send({
    paperId: chunk.paperId,
    chunkId: chunk.id,
    priority: computePriority(chunk),
    retryCount: 0
  });
}
```

### 2. Provider Selection

Phase 5 uses Phase 4's provider factory:

```typescript
import { createProvider } from './extraction/providers/ProviderFactory';

const provider = createProvider({
  preferred: config.preferredProvider,
  requireStructuredOutput: true,
  apiKeys: {
    openai: process.env.OPENAI_API_KEY
  }
});
```

### 3. Validation Pipeline Stage

Phase 5 integrates EvidenceValidator as pipeline stage:

```typescript
async function processChunk(chunk: Chunk): Promise<ExtractionJobResult> {
  // Extract
  const extraction = await provider.extract(chunk, config);
  
  // Validate schema (Zod)
  try {
    const validated = validateExtractionResult(extraction.data!);
    
    // Validate evidence grounding
    const validator = new EvidenceValidator();
    const grounded = validator.validate(validated, chunk);
    
    if (!grounded.isValid) {
      return {
        jobId: generateId(),
        status: 'partial',
        errors: grounded.errors,
        ...metadata
      };
    }
    
    return {
      jobId: generateId(),
      status: 'completed',
      result: validated,
      ...metadata
    };
  } catch (error) {
    return {
      jobId: generateId(),
      status: 'failed',
      errors: [mapError(error)],
      ...metadata
    };
  }
}
```

## Known Limitations

### 1. Single-Chunk Processing

Phase 4 validates each chunk independently. Cross-chunk entity resolution deferred to Phase 8.

**Workaround:** Phase 5 should track entity lookup table across chunks in same paper.

### 2. No Deduplication

Phase 4 extracts entities per-chunk without global deduplication.

**Workaround:** Phase 5 should maintain normalized form index for duplicate detection.

### 3. Provider Rate Limits

OpenAI provider has rate limits (~500 requests/minute for GPT-4o).

**Mitigation:** Phase 5 must implement:
- Request queuing with backpressure
- Exponential backoff on 429 responses
- Fallback to alternative providers

## Recommended Batch Sizes

| Paper Length | Chunks | Batch Size | Est. Time |
|--------------|--------|------------|-----------|
| Short (<8 pages) | 5–10 | 5 concurrent | ~30 seconds |
| Medium (8–15 pages) | 10–20 | 10 concurrent | ~60 seconds |
| Long (>15 pages) | 20–40 | 15 concurrent | ~120 seconds |

**Note:** Adjust based on observed API latency and rate limits.

## Cost Projections

Based on validation metrics:

| Metric | Value | Unit Cost | Per Paper |
|--------|-------|-----------|-----------|
| Avg Input Tokens | 1200 | $2.50/M | $0.003 |
| Avg Output Tokens | 650 | $10.00/M | $0.0065 |
| **Total per Chunk** | | | **$0.0095** |
| **Avg Chunks per Paper** | 15 | | |
| **Total per Paper** | | | **$0.14** |

**Monthly Projection (1000 papers):** ~$140

## Monitoring Requirements

Phase 5 must track:

1. **Throughput:** Chunks processed per minute
2. **Error Rates:** By error type (schema vs evidence)
3. **Provider Health:** Success rate per provider
4. **Cost:** Running total vs budget
5. **Queue Depth:** Backlog indicator

```typescript
// Example monitoring
metrics.increment('extraction.chunks.processed');
metrics.increment(`extraction.errors.${errorType}`);
metrics.histogram('extraction.duration_ms', durationMs);
metrics.gauge('extraction.queue.depth', queueLength);
```

## Error Handling Protocol

### Retryable Errors
- `TIMEOUT`: Retry up to 3 times with exponential backoff
- `RATE_LIMIT`: Retry after cooldown period
- `PROVIDER_ERROR`: Retry once, then fallback

### Non-Retryable Errors
- `AUTH_ERROR`: Halt pipeline, alert operators
- `VALIDATION_ERROR`: Log, continue with next chunk
- `MALFORMED_RESPONSE`: Retry once, then mark failed

## Testing Strategy for Phase 5

### Unit Tests
- Queue message serialization/deserialization
- Provider selection logic
- Error classification

### Integration Tests
- End-to-end extraction with mock LLM
- Validation pipeline stages
- Database write operations

### Load Tests
- Concurrent chunk processing
- Rate limit handling
- Memory usage under load

## Sign-Off Checklist

Phase 5 may begin when:

- [x] Typed extraction schemas defined
- [x] Provider abstraction functional
- [x] Evidence validator deployed
- [x] Validation suite passes targets
- [ ] Documentation complete (this document)
- [ ] Knowledge transfer completed

---

*This handoff document is part of Phase 4 deliverables. See docs/phases/phase-4/ for related documentation.*
