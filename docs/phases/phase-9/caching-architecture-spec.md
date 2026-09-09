# Phase 9: Caching Architecture Specification

## Overview

This document specifies the three-tier caching architecture implemented in Phase 9 to deliver sub-second interactions and efficient resource utilization.

## Tier Definitions

### Tier 1: Browser Memory Cache (L1)

**Storage**: In-memory `Map` + IndexedDB for persistence
**TTL**: 5 minutes (configurable)
**Max Size**: 100 entries (LRU eviction)
**Use Cases**:
- Parsed document structures
- Layout computation results
- Merged graph JSON
- User session state

**Implementation**:
```typescript
// src/lib/cache/CacheManager.ts
export class CacheManager {
  private l1Cache: Map<string, CacheEntry<unknown>>;
  private indexedDB: IDBDatabase | null;
  
  async get<T>(key: string, tier: CacheTier): Promise<T | null>;
  async set<T>(key: string, value: T, tier: CacheTier, ttl?: number, version?: string): Promise<void>;
  async invalidate(pattern: string): Promise<void>;
}
```

**Key Structure**:
- Single paper: `{paperId}:{extractionVersion}:{dataType}`
  - Example: `paper:abc123:v2.1.0:graph`
- Multi-paper: `{sortedPaperIds}:{registryVersion}:{dataType}`
  - Example: `synthesis:abc123:def456:ghi789:v1.0.0:mergedGraph`

### Tier 2: Edge Function Response Cache (L2)

**Storage**: Vercel Edge Network
**TTL**: 5 minutes public, 1 minute stale-while-revalidate
**Use Cases**:
- Read-only API endpoints
- `/api/papers/:id/graph`
- `/api/entities/resolve`
- `/api/synthesis/merge`

**Headers**:
```
Cache-Control: public, s-maxage=300, stale-while-revalidate=60
Surrogate-Key: paper:{id}, entity:{canonicalId}, synthesis:{hash}
```

**Invalidation**: Tag-based purging via Supabase webhook on data mutation

### Tier 3: Supabase Storage Cache (L3)

**Storage**: Supabase Storage buckets
**Path Convention**: `cache/{tier}/{key}.json`
**Lifecycle**: Created on first compute, deleted on source data update
**Access Control**: RLS policies matching source data permissions

**Fallback Protocol**:
1. Check L1 → hit: return immediately
2. Check L2 → hit: populate L1, return
3. Check L3 → hit: populate L1, return
4. Miss: compute synchronously, populate L3 → L2 → L1 atomically

## Invalidation Protocol

### Trigger Events

| Event | Invalidated Patterns |
|-------|---------------------|
| Paper upload complete | `paper:{id}:*` |
| Extraction job completed | `paper:{id}:graph`, `paper:{id}:layout` |
| Entity registry updated | `entity:*`, `synthesis:*` |
| Merge configuration changed | `synthesis:{paperSetHash}:*` |

### Multi-Tab Synchronization

```typescript
// BroadcastChannel for cross-tab invalidation
this.broadcastChannel = new BroadcastChannel('synapse-cache-invalidation');
this.broadcastChannel.onmessage = (event) => {
  if (event.data.type === 'INVALIDATE') {
    this.invalidateLocal(event.data.pattern);
  }
};
```

### Version Tagging

Every cache entry includes a version string derived from source data hash:
```typescript
interface CacheEntry<T> {
  value: T;
  version: string; // e.g., "v2.1.0-abc123def"
  createdAt: number;
  ttl?: number;
}
```

On retrieval, version is validated against current source metadata. Mismatch = stale = miss.

## Failure Modes

### Scenario 1: IndexedDB Unavailable
**Fallback**: L1 memory-only cache
**Impact**: Cache lost on page refresh
**Mitigation**: Graceful degradation, user not notified

### Scenario 2: BroadcastChannel Not Supported
**Fallback**: localStorage polling (1s interval)
**Impact**: Slight delay in cross-tab sync
**Mitigation**: Feature detection with fallback

### Scenario 3: Thundering Herd on Cold Start
**Prevention**: Atomic cache population with request coalescing
```typescript
private pendingComputations: Map<string, Promise<any>> = new Map();

async computeAndCache(key: string, computeFn: () => Promise<any>) {
  if (this.pendingComputations.has(key)) {
    return this.pendingComputations.get(key);
  }
  const promise = computeFn();
  this.pendingComputations.set(key, promise);
  promise.finally(() => this.pendingComputations.delete(key));
  return promise;
}
```

## Monitoring

### Metrics to Track

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| L1 Hit Rate | <80% | Increase TTL or max size |
| L2 Hit Rate | <70% | Review cache headers |
| L3 Hit Rate | <90% | Investigate premature invalidation |
| Stale Read Incidents | >0 | Immediate investigation |
| Cache Size Growth | >50MB/user | Adjust quotas |

### Logging Format

```json
{
  "timestamp": "2026-09-12T14:30:00Z",
  "operation": "get",
  "tier": "L1",
  "key": "paper:abc123:graph",
  "hit": true,
  "latencyMs": 2,
  "version": "v2.1.0-abc123"
}
```

## Security Considerations

1. **RLS Enforcement**: L3 cache inherits source data RLS policies
2. **Tenant Isolation**: Cache keys include user/org prefix
3. **Sensitive Data**: Never cache PII or authentication tokens
4. **Quota Enforcement**: 50MB L1, 1GB L3 per user

## Performance Budgets

| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| L1 Get | <1ms | <5ms | <10ms |
| L3 Get | <50ms | <200ms | <500ms |
| L1 Set | <1ms | <5ms | <10ms |
| L3 Set | <100ms | <500ms | <1000ms |
| Invalidate | <10ms | <50ms | <100ms |

## Related Documents

- [Progressive Rendering Spec](./progressive-rendering-spec.md)
- [Bundle Optimization Spec](./bundle-optimization-spec.md)
- [Performance Runbook](./performance-runbook.md)
- [Handoff to Phase 10](./handoff-to-phase-10.md)
