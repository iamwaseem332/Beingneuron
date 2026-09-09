# Phase 9: Performance Runbook

## Overview

This runbook provides operational guidance for monitoring, debugging, and maintaining the performance optimizations implemented in Phase 9.

## Monitoring Setup

### Required Dashboards

#### 1. Core Web Vitals Dashboard

**Metrics**:
- LCP (Largest Contentful Paint)
- FID (First Input Delay)  
- CLS (Cumulative Layout Shift)
- TTI (Time to Interactive)

**Data Source**: Chrome UX Report API + custom RUM

**Alert Thresholds**:
| Metric | Warning | Critical |
|--------|---------|----------|
- LCP | >1.8s | >2.5s |
| FID | >120ms | >200ms |
| CLS | >0.08 | >0.15 |
| TTI | >3.0s | >4.0s |

#### 2. Cache Performance Dashboard

**Metrics**:
- L1/L2/L3 hit rates
- Cache invalidation frequency
- Stale read incidents
- Cache size per user

**Grafana Query Example**:
```sql
SELECT 
  time_bucket('5m', timestamp) AS time,
  AVG(CASE WHEN tier = 'L1' AND hit THEN 1 ELSE 0 END) * 100 AS l1_hit_rate,
  AVG(CASE WHEN tier = 'L2' AND hit THEN 1 ELSE 0 END) * 100 AS l2_hit_rate,
  AVG(CASE WHEN tier = 'L3' AND hit THEN 1 ELSE 0 END) * 100 AS l3_hit_rate
FROM cache_logs
WHERE $__timeFilter(timestamp)
GROUP BY time
ORDER BY time
```

#### 3. Rendering Performance Dashboard

**Metrics**:
- Frame time p50/p95/p99
- LOD transition frequency
- Main thread blocking time
- Progressive render completion rate

**Data Source**: Performance API via RUM beacon

#### 4. Bundle Size Dashboard

**Metrics**:
- Initial JS size (gzipped)
- Route chunk sizes
- Total transfer size
- Cache hit ratio for static assets

**Data Source**: Build artifacts + CDN logs

## Alert Configuration

### PagerDuty Integration

**Critical Alerts** (page immediately):
- LCP >2.5s for 5+ minutes
- Cache stale read incident detected
- Frame time p99 >50ms for 10+ minutes
- Bundle regression >20% vs baseline

**Warning Alerts** (email/Slack):
- L1 hit rate <80% for 30+ minutes
- LCP >1.8s for 15+ minutes
- Memory growth >50MB/session
- Cache invalidation spike >3x normal

### Alert Routing

| Alert Type | Primary | Secondary | Escalation |
|------------|---------|-----------|------------|
| Core Web Vitals | Frontend On-call | Tech Lead | VP Engineering (30min) |
| Cache Issues | Backend On-call | Platform Lead | CTO (1hr) |
| Rendering | Frontend On-call | UX Lead | - |
| Bundle Size | Frontend On-call | Tech Lead | - |

## Debugging Guide

### Scenario 1: High LCP

**Symptoms**: LCP >2.5s, users report slow page loads

**Investigation Steps**:
1. Check Lighthouse CI report for recent regressions
2. Review bundle size dashboard for JS bloat
3. Inspect network waterfall for slow resources
4. Verify image optimization pipeline functioning
5. Check font loading strategy

**Common Causes**:
- Unoptimized hero image
- Render-blocking CSS/JS
- Slow API response for initial data
- Font loading without `font-display: swap`

**Fixes**:
```bash
# Analyze bundle regression
npm run analyze-bundle -- --compare HEAD~1

# Check image optimization
npx imagemin src/assets/hero.jpg --out-dir=src/assets/optimized

# Verify critical CSS extraction
grep -r "critical" dist/index.html
```

### Scenario 2: Low Cache Hit Rate

**Symptoms**: L1 hit rate <70%, increased API calls

**Investigation Steps**:
1. Check cache invalidation logs for excessive purges
2. Verify TTL configuration hasn't changed
3. Inspect key generation logic for inconsistencies
4. Review multi-tab sync for race conditions

**Common Causes**:
- Over-aggressive invalidation on data updates
- Key mismatch between get/set operations
- TTL too short for usage patterns
- BroadcastChannel failures in older browsers

**Fixes**:
```typescript
// Debug cache keys
const cache = getGlobalCacheManager();
cache.debug = {
  logOperations: true,
  showKeyGeneration: true
};

// Check invalidation patterns
SELECT pattern, COUNT(*) 
FROM cache_invalidation_logs 
WHERE $__timeFilter(timestamp)
GROUP BY pattern 
ORDER BY COUNT DESC 
LIMIT 10;
```

### Scenario 3: Frame Drops During Interaction

**Symptoms**: Drag FPS <45, janky zoom/pan

**Investigation Steps**:
1. Open Chrome DevTools Performance tab
2. Record interaction session
3. Identify long tasks (>50ms)
4. Check LOD transition timing
5. Verify progressive renderer queue depth

**Common Causes**:
- Too many immediate-priority nodes
- LOD transitions triggering layout thrashing
- Event handlers not debounced
- Canvas redraw area too large

**Fixes**:
```typescript
// Enable rendering debug overlay
renderer.debug = {
  showPriorityBoundaries: true,
  showFrameTiming: true,
  maxImmediateNodes: 50 // Reduce from 100
};

// Check deferred work queue
console.log('Pending work items:', renderer.pendingWork.length);

// Profile frame composition
performance.getEntriesByType('paint')
  .filter(e => e.name === 'first-contentful-paint');
```

### Scenario 4: Memory Leak

**Symptoms**: Memory growth >100MB over 30min session

**Investigation Steps**:
1. Take heap snapshot in DevTools
2. Compare snapshots at 5min intervals
3. Search for detached DOM trees
4. Check for unclosed event listeners
5. Verify cache eviction working

**Common Causes**:
- Event listeners not removed on unmount
- Progressive renderer work queue not cleared
- IndexedDB connections not closed
- React component state growing unbounded

**Fixes**:
```typescript
// Check for memory leaks in renderer
renderer.dispose(); // Should clear all pending work

// Verify cache cleanup
await cache.clear();
console.log('L1 size after clear:', cache.l1Cache.size);

// Take heap snapshot
// DevTools → Memory → Heap Snapshot → Take Snapshot
```

## Performance Budgets

### Production SLOs

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| LCP | ≤1.5s | p75 of all page views |
| FID | ≤100ms | p75 of all interactions |
| CLS | ≤0.05 | p75 of all sessions |
| TTI | ≤2.5s | p75 of all page views |
| Drag FPS | ≥55 | Sustained during interaction |
| Cache L1 Hit | ≥90% | Rolling 24h average |
| Memory Growth | ≤40MB/30min | Active sessions |

### Budget Enforcement

**CI Pipeline**:
```yaml
# .github/workflows/performance-budget.yml
- name: Performance Budget Check
  uses: treosh/lighthouse-ci-action@v10
  with:
    uploadArtifacts: true
    budgetPath: ./budget.json
    failOnError: true
```

**budget.json**:
```json
{
  "resourceSizes": [
    {"resourceType": "script", "budget": 150},
    {"resourceType": "stylesheet", "budget": 50},
    {"resourceType": "image", "budget": 200}
  ],
  "timings": [
    {"metric": "first-contentful-paint", "budget": 1200},
    {"metric": "largest-contentful-paint", "budget": 1500},
    {"metric": "total-blocking-time", "budget": 300}
  ]
}
```

## Incident Response

### Severity Classification

| Severity | Impact | Response Time | Resolution Time |
|----------|--------|---------------|-----------------|
| P0 | Site unusable, >50% users affected | <15min | <2hrs |
| P1 | Major degradation, >20% users affected | <1hr | <8hrs |
| P2 | Minor degradation, <20% users affected | <4hrs | <24hrs |
| P3 | Edge case, <5% users affected | <24hrs | <1 week |

### Runbook Execution

**For P0/P1 Incidents**:
1. Acknowledge alert in PagerDuty
2. Join incident war room (Zoom link in alert)
3. Share screen with dashboards
4. Execute relevant debugging steps above
5. Implement hotfix or rollback
6. Verify fix with canary deployment
7. Document root cause in post-mortem

### Rollback Procedure

```bash
# Revert to previous stable version
git checkout main
git revert HEAD --no-edit
git push origin main

# Trigger redeployment
vercel --prod

# Verify rollback
curl -I https://beingneuron.com | grep x-vercel-deployment
```

## Related Documents

- [Caching Architecture Spec](./caching-architecture-spec.md)
- [Progressive Rendering Spec](./progressive-rendering-spec.md)
- [Bundle Optimization Spec](./bundle-optimization-spec.md)
- [Validation Report](./validation-report.md)
- [Handoff to Phase 10](./handoff-to-phase-10.md)
