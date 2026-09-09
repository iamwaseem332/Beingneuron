# Phase 5: Resilience Patterns Specification

## Overview

Three hierarchical resilience patterns protect the extraction pipeline from failures.

## Pattern 1: Exponential Backoff Retry

### Configuration

```typescript
{
  baseDelayMs: 5000,      // 5 seconds
  maxDelayMs: 300000,     // 5 minutes
  maxRetries: 3
}
```

### Delay Calculation

```
delay = min(baseDelay * 2^retryCount, maxDelay) + jitter
jitter = delay * 0.1 * (random(-1, 1))
```

### Idempotency Guarantee

Chunk extraction results keyed by `(paper_id, chunk_sequence, prompt_version)` prevent duplicate writes on retry.

## Pattern 2: Circuit Breaker

### States

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation, tracking failures |
| OPEN | All requests routed to fallback |
| HALF_OPEN | Single test request allowed |

### Thresholds

- `failureThreshold`: 5 failures in 60s → OPEN
- `resetTimeoutMs`: 30s cooldown before HALF_OPEN
- `monitoringWindowMs`: 60s failure window

### Fallback Activation

When circuit is OPEN, requests route to `FallbackRegexProvider` which extracts basic entities (authors, institutions) with low confidence and marks all relations as `isExplicitlyStated: false`.

## Pattern 3: Dead Letter Queue (DLQ)

### Trigger Conditions

- Max retries exceeded (retry_count >= max_retries)
- Non-recoverable error (auth failure, schema validation)
- Cost budget exceeded

### DLQ Entry Schema

```typescript
interface DLQEntry {
  jobId: string;
  paperId: string;
  userId: string;
  status: 'dead_letter';
  retryCount: number;
  errorMessage: string;
  errorHistory: Array<{timestamp, error, chunkSequence?}>;
  lastSuccessfulChunk?: number;
  totalChunks: number;
  tokenUsageInput: number;
  tokenUsageOutput: number;
  estimatedCostUsd: number;
  deadLetteredAt: string;
}
```

### Retention Policy

- DLQ entries retained for 30 days
- Auto-archived after retention period
- Manual review/retry via admin dashboard

## Failure Taxonomy

### Recoverable Errors (Retry)

- Timeout errors
- Rate limits (429)
- Service unavailable (503)
- Network errors
- Transient API failures (502, 504)

### Non-Recoverable Errors (DLQ)

- Authentication failures (401)
- Authorization failures (403)
- Invalid request (400)
- Schema validation errors
- Evidence grounding failures

## Runbook: DLQ Triage

1. Query DLQ: `SELECT * FROM extraction_jobs WHERE status = 'dead_letter'`
2. Review error messages for pattern
3. If systemic (API outage): wait for resolution, then bulk retry
4. If data-specific (validation failure): manual inspection required
5. Retry command: `UPDATE extraction_jobs SET status='pending', retry_count=0 WHERE id = $jobId`
