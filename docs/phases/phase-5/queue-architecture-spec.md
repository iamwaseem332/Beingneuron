# Phase 5: Queue Architecture Specification

## Overview

This document specifies the Supabase-native job queue architecture for orchestrating LLM-based paper extraction at scale.

## Database Schema

### extraction_jobs Table

```sql
CREATE TABLE extraction_jobs (
  id UUID PRIMARY KEY,
  paper_id UUID NOT NULL REFERENCES papers(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  current_chunk_sequence INT,
  total_chunks INT NOT NULL,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  token_usage_input BIGINT DEFAULT 0,
  token_usage_output BIGINT DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Indexes

- `idx_extraction_jobs_polling`: Optimizes job polling queries
- `idx_extraction_jobs_user_status`: Supports user-facing job lists
- `idx_extraction_jobs_paper`: Enables paper-level job lookups

## Advisory Locking Protocol

Jobs are protected from duplicate processing using PostgreSQL advisory locks:

1. Worker calls `try_advisory_job_lock(job_id)` before processing
2. Lock acquired via `pg_try_advisive_lock(hashtext(job_id::text))`
3. Processing occurs within same transaction
4. Lock released automatically on commit/rollback

### Lock Contention Handling

- Use `SKIP LOCKED` in polling query if contention >50%
- Monitor lock wait times via `pg_stat_activity`
- Tune batch size based on concurrency patterns

## Queue Consumer Algorithm

```typescript
async function processQueue(): Promise<void> {
  const jobs = await fetchEligibleJobs(batchSize);
  
  for (const job of jobs) {
    const locked = await acquireLock(job.id);
    if (!locked) continue;
    
    try {
      await processJob(job);
    } finally {
      await releaseLock(job.id);
    }
  }
}
```

## Scaling Considerations

- **Batch Size**: Default 5 jobs per invocation (Edge Function memory limit)
- **Polling Interval**: 30 seconds via pg_cron
- **Max Concurrent Jobs**: 10 per Edge Function instance
- **Queue Depth Monitoring**: Via `vw_extraction_queue_health` view

## Failure Modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Worker crash mid-job | Lock held indefinitely | Lock auto-released on session end |
| Duplicate job submission | Unique constraint | ON CONFLICT IGNORE |
| API outage cascade | Circuit breaker | Fallback provider activation |
| Cost budget exceeded | Pre-chunk check | Job halted, moved to DLQ |
