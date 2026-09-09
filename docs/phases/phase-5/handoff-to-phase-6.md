# Phase 5 to Phase 6 Handoff Document

## Overview

This document defines the interface contracts and integration points between Phase 5 (Async Extraction Pipeline) and Phase 6 (Deterministic Graph Layout Engine).

## Input Contract for Phase 6

### Trigger Mechanism

Phase 6 graph build is triggered when:
1. Job status transitions to `completed`
2. Webhook sent to graph builder endpoint
3. Realtime event published on `graph_build_requests` channel

### Data Availability

Upon job completion, Phase 6 can query:

```sql
SELECT 
  e.id, e.type, e.normalized_form, e.raw_mentions,
  e.evidence_spans, e.confidence
FROM extracted_entities e
WHERE e.paper_id = $paperId;

SELECT 
  r.id, r.source_entity_id, r.target_entity_id,
  r.type, r.is_explicitly_stated, r.confidence
FROM extracted_relations r
WHERE r.paper_id = $paperId;
```

### Quality Guarantees

All entities and relations delivered to Phase 6 have:
- ✅ Passed Zod schema validation
- ✅ Passed evidence grounding validation
- ✅ Verifiable excerpt matches
- ✅ Confidence scores ≥ 0.5 (configurable threshold)

## Status Subscription Guide

Frontend components subscribe to extraction progress:

```typescript
// Subscribe to job progress
const channel = supabase
  .channel('extraction-progress')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'extraction_jobs',
      filter: `user_id=eq.${userId}`
    },
    handleJobUpdate
  )
  .subscribe();

// Unsubscribe on component unmount
return () => channel.unsubscribe();
```

## Cost Projection Model

### Per-Paper Costs

| Paper Size | Chunks | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|------------|--------|-------------------|--------------------|-----------|
| Small | 10-20 | 15K | 8K | $0.007 |
| Medium | 20-50 | 40K | 20K | $0.018 |
| Large | 50-100 | 80K | 40K | $0.036 |
| Extra Large | 100-200 | 160K | 80K | $0.072 |

### Monthly Projections

Assuming 100 papers/month average size:
- **Free tier**: 50 papers → $1.80/month
- **Pro tier**: 500 papers → $18.00/month
- **Enterprise**: 2000 papers → $72.00/month

## Known Limitations

1. **Edge Function Timeout**: 2-minute hard limit mitigated by chunk-level progress tracking
2. **Circuit Breaker Scope**: Instance-scoped (not distributed); may open inconsistently across replicas
3. **DLQ Manual Review**: No automated retry logic for DLQ entries

## Recommended Batch Sizes

| Scenario | Batch Size | Rationale |
|----------|------------|-----------|
| Normal operation | 5 | Balance throughput vs. memory |
| Backlog clearing | 10 | Maximize throughput |
| API instability | 2 | Minimize blast radius |
| Testing | 1 | Deterministic debugging |

## Phase 6 Integration Checklist

- [ ] Consume `completed` job webhook events
- [ ] Query validated entities/relations by paper_id
- [ ] Filter by confidence threshold (default 0.5)
- [ ] Respect `is_explicitly_stated` flag for edge styling
- [ ] Use evidence spans for tooltip citations
- [ ] Handle missing data gracefully (partial extractions)

## Contact

For questions about Phase 5 deliverables, refer to:
- Queue Architecture: `docs/phases/phase-5/queue-architecture-spec.md`
- Resilience Patterns: `docs/phases/phase-5/resilience-patterns-spec.md`
- Cost Governance: `docs/phases/phase-5/cost-governance-spec.md`
