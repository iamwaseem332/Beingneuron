# Phase 9 → Phase 10 Handoff Document

## Overview

This document provides the interface contracts, performance budgets, and operational guidance required for Phase 10 (Testing Infrastructure, Evaluation Framework, and Production Hardening) to proceed.

## Deliverables Summary

Phase 9 has completed all four workstreams:

| Workstream | Status | Key Files |
|------------|--------|-----------|
| A: Multi-Tier Caching | ✅ Complete | `src/lib/cache/CacheManager.ts` |
| B: Progressive Rendering | ✅ Complete | `src/lib/rendering/ProgressiveRenderer.ts` |
| C: Bundle Optimization | ✅ Complete | `vite.config.ts`, tree-shaking config |
| D: Performance Validation | ✅ Complete | `tests/phase-9/*.test.ts` |

## Performance Budgets for Production Monitoring

Phase 10 must validate these budgets hold under production load:

### Core Web Vitals (p75)

| Metric | Budget | Measurement | Owner |
|--------|--------|-------------|-------|
| LCP | ≤1.5s | All page views | Frontend |
| FID | ≤100ms | All interactions | Frontend |
| CLS | ≤0.05 | All sessions | Frontend |
| TTI | ≤2.5s | All page views | Platform |

### Interaction Performance

| Metric | Budget | Scenario | Owner |
|--------|--------|----------|-------|
| Node Click Latency | ≤150ms | Evidence panel open | Frontend |
| Drag FPS | ≥55fps | 300-node merged graph | Frontend |
| Zoom/Pan Frame Time | ≤16ms (p95) | Continuous interaction | Frontend |
| Mode Transition | ≤400ms | Hierarchical ↔ Clustered | Frontend |

### Resource Efficiency

| Metric | Budget | Condition | Owner |
|--------|--------|-----------|-------|
| Main Thread Blocking | ≤50ms | Max task duration | Frontend |
| Memory Growth | ≤40MB | After 30min session | Frontend |
| Network Transfer | ≤300KB | Initial page load | Platform |
| CPU Idle Usage | ≤5% | Graph visible, no interaction | Frontend |

### Caching Effectiveness

| Metric | Budget | Window | Owner |
|--------|--------|--------|-------|
| L1 Hit Rate | ≥90% | Rolling 24h | Backend |
| L2 Hit Rate | ≥80% | Rolling 24h | Platform |
| L3 Hit Rate | ≥95% | Rolling 24h | Backend |
| Invalidations Correctness | 100% | Zero stale reads | Backend |

## Cache Warming Strategy

For production launch, implement cache warming to ensure cold starts don't violate budgets:

### Pre-Compute High-Value Papers

```sql
-- Identify top-accessed papers from analytics
SELECT paper_id, COUNT(*) as access_count
FROM paper_access_logs
WHERE accessed_at > NOW() - INTERVAL '7 days'
GROUP BY paper_id
ORDER BY access_count DESC
LIMIT 100;
```

### Warm Cache on Deployment

```typescript
// scripts/warm-cache.ts
import { warmPaperCache } from '@/lib/cache/warming';

const topPapers = await getTopAccessedPapers(100);

for (const paper of topPapers) {
  // Pre-compute and cache layout
  await warmPaperCache(paper.id, {
    precomputeLayout: true,
    preloadEvidence: true,
    ttl: 24 * 60 * 60 * 1000 // 24 hours
  });
}
```

### CDN Pre-Fetch

Configure CDN to pre-fetch cached assets:
```
# /etc/vercel.json
{
  "caching": {
    "preFetch": [
      "/api/papers/*/graph",
      "/api/entities/resolve",
      "/cache/*/layout.json"
    ]
  }
}
```

## Known Limitations

### Limitation 1: IndexedDB Quota Variability

**Issue**: Browser IndexedDB quotas vary (Chrome: 60% disk space, Firefox: 10%, Safari: ~1GB)

**Impact**: Users with many papers may hit quota on restrictive browsers

**Mitigation**: 
- Implement LRU eviction when approaching quota
- Fall back to memory-only cache if IndexedDB full
- Phase 10 should add quota monitoring to dashboards

### Limitation 2: BroadcastChannel Not Universal

**Issue**: BroadcastChannel unsupported in Safari <15.4, some mobile browsers

**Impact**: Cross-tab cache sync delayed by fallback polling interval (1s)

**Mitigation**:
- Graceful degradation to localStorage polling
- Visual indicator when sync may be stale
- Phase 10 should measure fallback usage rate

### Limitation 3: LOD Transition Jank on Low-End Devices

**Issue**: Devices with <4GB RAM may experience jank during LOD transitions

**Impact**: Occasional frame drops during zoom/pan on budget laptops

**Mitigation**:
- Detect low-memory devices via heuristics
- Disable LOD transitions, use static LOD based on zoom
- Phase 10 should profile on representative low-end hardware

### Limitation 4: Bundle Size Creep Risk

**Issue**: New features in Phases 10+ may increase bundle size

**Impact**: Risk of exceeding 150KB initial JS budget

**Mitigation**:
- Strict CI enforcement of bundle budgets
- Require justification for any chunk >20KB
- Phase 10 should add automated regression alerts

## Interface Contracts for Phase 10

### Cache API

```typescript
// Phase 10 can rely on this interface
interface CacheManager {
  get<T>(key: string, tier: CacheTier): Promise<T | null>;
  set<T>(key: string, value: T, tier: CacheTier, ttl?: number, version?: string): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  clear(): Promise<void>;
}
```

### Progressive Renderer API

```typescript
// Phase 10 can rely on this interface
interface ProgressiveRenderer {
  computePriorities(nodes, edges, viewport): {
    immediate: RenderableNode[];
    deferred: RenderableNode[];
    background: RenderableNode[];
  };
  scheduleDeferredWork(workFn: () => void): void;
  cancel(): void;
  dispose(): void;
}
```

### Performance Metrics API

```typescript
// Phase 10 should extend this interface
interface PerformanceMetrics {
  // Core Web Vitals
  lcp: number;
  fid: number;
  cls: number;
  tti: number;
  
  // Interaction metrics
  dragFps: number;
  clickLatency: number;
  frameTimeP95: number;
  
  // Resource metrics
  memoryGrowth: number;
  networkTransfer: number;
  cpuIdleUsage: number;
  
  // Cache metrics
  l1HitRate: number;
  l2HitRate: number;
  l3HitRate: number;
}
```

## Testing Requirements for Phase 10

Phase 10 must validate:

1. **Load Testing**: 1000 concurrent users, verify budgets hold
2. **Soak Testing**: 24hr continuous operation, check for memory leaks
3. **Chaos Testing**: Simulate cache failures, verify graceful degradation
4. **A/B Testing**: Compare Phase 9 optimizations vs baseline with real users
5. **Cross-Browser Testing**: Validate on Chrome, Firefox, Safari, Edge (latest 2 versions)

## Deployment Checklist

Before Phase 10 begins production hardening:

- [ ] All Phase 9 tests passing (17/17 unit tests)
- [ ] Performance budgets documented and monitored
- [ ] Cache warming script tested in staging
- [ ] Rollback procedure documented and rehearsed
- [ ] On-call team trained on runbook
- [ ] Dashboards configured with alert thresholds
- [ ] CDN cache headers verified
- [ ] Bundle size CI checks enforced

## Success Criteria for Phase 10

Phase 10 complete when:

1. Production SLOs validated with real user traffic (7-day window)
2. Automated performance regression detection operational
3. Incident response runbook tested with fire drill
4. All Phase 9 optimizations proven stable at scale
5. Zero P0/P1 incidents related to caching or rendering

## Related Documents

- [Caching Architecture Spec](./caching-architecture-spec.md)
- [Progressive Rendering Spec](./progressive-rendering-spec.md)
- [Bundle Optimization Spec](./bundle-optimization-spec.md)
- [Validation Report](./validation-report.md)
- [Performance Runbook](./performance-runbook.md)

---

**Phase 9 Status**: ✅ COMPLETE  
**Ready for Phase 10**: Yes  
**Handoff Date**: 2026-09-09  
**Handoff Author**: Engineering Team
