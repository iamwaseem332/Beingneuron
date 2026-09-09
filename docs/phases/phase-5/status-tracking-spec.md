# Phase 5: Status Tracking Specification

## State Machine

### Valid States

| State | Description | Terminal |
|-------|-------------|----------|
| `pending` | Queued, awaiting worker | No |
| `processing` | Actively extracting chunks | No |
| `completed` | All chunks extracted + validated | Yes |
| `failed` | Recoverable error, will retry | No |
| `dead_letter` | Max retries exhausted | Yes |

### State Transition Matrix

```
pending     → processing
processing  → completed | failed
failed      → processing (retry) | dead_letter
completed   → (none)
dead_letter → (none)
```

## Realtime Integration

Frontend subscribes to job updates via Supabase Realtime:

```typescript
const channel = supabase
  .channel(`job:${jobId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'extraction_jobs',
      filter: `id=eq.${jobId}`
    },
    (payload) => {
      updateJobProgress(payload.new);
    }
  )
  .subscribe();
```

## Progress Calculation

```typescript
percentComplete = Math.round((currentChunk / totalChunks) * 100);
estimatedTimeRemaining = avgChunkDuration * remainingChunks;
```

## Error Message Sanitization

All error messages are sanitized before storage:
- API keys replaced with `[REDACTED_API_KEY]`
- File paths replaced with `[PATH_REDACTED]`
- Stack traces removed
- Truncated to 500 characters

## API Endpoint

`GET /api/extraction/jobs/:id/progress`

Returns `JobProgress` object for non-Realtime clients.
