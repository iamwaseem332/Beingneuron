# Phase 8: Handoff to Phase 9

## Overview

This document defines the interface contracts and handoff requirements from Phase 8 (Multi-Paper Synthesis) to Phase 9 (Performance Optimization and Progressive Rendering).

**Handoff Date:** 2026-09-12  
**Phase 8 Status:** ✅ Complete  
**Phase 9 Start:** Ready to begin

---

## Deliverables Summary

### Source Code Components

| Component | Location | Purpose |
|-----------|----------|---------|
| EntityNormalizer | `src/lib/synthesis/EntityNormalizer.ts` | Fuzzy matching, alias lookup, entity resolution |
| GraphMerger | `src/lib/synthesis/GraphMerger.ts` | Cross-document graph merging with typed strategies |
| ConflictResolver | `src/lib/synthesis/ConflictResolver.ts` | Conflict detection and evidence weighting |
| SynthesisValidator | `src/lib/synthesis/SynthesisValidator.ts` | Validation suite for quality metrics |
| Types | `src/lib/synthesis/types.ts` | TypeScript interfaces for all synthesis types |

### Database Schema

| Migration | Tables | Purpose |
|-----------|--------|---------|
| `20260912100000_create_canonical_entities.sql` | `canonical_entities`, `entity_mentions` | Entity registry with RLS policies |

### Test Suite

| Test File | Coverage |
|-----------|----------|
| `tests/phase-8/synthesis-quality.spec.ts` | Entity normalization, graph merge, conflict resolution |

### Documentation

| Document | Purpose |
|----------|---------|
| `entity-normalization-spec.md` | Matching algorithms, curation workflow |
| `graph-merger-spec.md` | Merge strategies, caching, performance targets |
| `conflict-resolution-spec.md` | Conflict taxonomy, weighting formulas |
| `validation-report.md` | SVS results with user testing data |
| `curation-guide.md` | Human curator training manual |

---

## Interface Contracts for Phase 9

### Contract 1: Merged Graph API

**Input:** Array of paper IDs  
**Output:** `MergedGraph` object

```typescript
interface MergedGraphRequest {
  paperIds: string[];
  includeConflicts?: boolean;
  minConfidence?: number;
}

interface MergedGraphResponse {
  nodes: MergedNode[];
  edges: MergedEdge[];
  metadata: {
    paperIds: string[];
    nodeCount: number;
    edgeCount: number;
    mergedAt: string;
    registryVersion: string;
    hasConflicts: boolean;
  };
  cacheHit: boolean;
  computationTimeMs: number;
}
```

**SLA Targets:**
- p95 latency: ≤3s for 5 papers
- Cache hit rate: ≥95%
- Error rate: <1%

---

### Contract 2: Registry Lookup API

**Input:** Entity mention + context  
**Output:** Canonical entity or null

```typescript
interface RegistryLookupRequest {
  mention: string;
  entityType?: EntityType;
  context?: string;      // For embedding disambiguation
  paperId?: string;      // For type hinting
}

interface RegistryLookupResponse {
  canonicalEntity: CanonicalEntity | null;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'embedding' | 'new';
  matchScore: number;
  requiresReview: boolean;
  alternatives?: CanonicalEntity[];  // For low-confidence matches
}
```

**SLA Targets:**
- p99 latency: ≤200ms
- Cache hit rate: ≥98%

---

### Contract 3: Conflict Metadata API

**Input:** Merged graph edge ID  
**Output:** Conflict information

```typescript
interface ConflictInfoRequest {
  edgeId: string;
}

interface ConflictInfoResponse {
  hasConflict: boolean;
  conflicts?: ConflictInfo[];
  resolution?: ConflictResolution;
  evidenceWeights: number[];
}
```

**Usage:** Phase 9 progressive rendering uses this to prioritize high-conflict edges for early display.

---

## Performance Budgets for Phase 9

### Rendering Performance

| Metric | Budget | Measurement Point |
|--------|--------|-------------------|
| Initial render (100 nodes) | ≤800ms | Time to interactive |
| Node highlight on hover | ≤50ms | Input latency |
| Pan/zoom FPS | ≥55fps | Continuous interaction |
| Memory growth (10min) | ≤30MB | Heap delta |

### Progressive Rendering Requirements

Phase 9 must implement progressive disclosure based on:

1. **Conflict Priority:** High-conflict edges rendered first
2. **Evidence Weight:** Higher-weight nodes prioritized
3. **Viewport Culling:** Only visible nodes rendered initially
4. **Level of Detail:** Simplified nodes at zoom-out, detailed at zoom-in

```typescript
interface ProgressiveRenderConfig {
  initialNodeLimit: number;       // e.g., 50 nodes
  conflictPriorityBoost: number;  // e.g., 1.5x
  evidenceWeightThreshold: number;// e.g., 0.7
  lodZoomThresholds: number[];    // e.g., [0.5, 1.0, 2.0]
}
```

---

## Known Limitations to Address in Phase 9

### Limitation 1: Embedding Disambiguation Not Implemented

**Current State:** String-based fuzzy matching only  
**Phase 9 Action:** Integrate embedding API for semantic similarity  
**Impact:** Scope mismatches may require more human curation until resolved

### Limitation 2: Static Citation Counts

**Current State:** Citation counts from monthly snapshot  
**Phase 9 Action:** Implement real-time citation sync job  
**Impact:** Evidence weights may be slightly stale

### Limitation 3: Single-Domain Validation

**Current State:** Validated primarily on NLP/ML papers  
**Phase 9 Action:** Test with other domains (biology, physics)  
**Impact:** Domain-specific terminology may need tuning

### Limitation 4: No Multi-Language Support

**Current State:** English-only entity normalization  
**Phase 9 Action:** Add cross-lingual entity linking  
**Impact:** Non-English papers not properly synthesized

---

## Caching Strategy for Phase 9 Optimization

### Current Cache Layers

```
┌─────────────────────────────────────┐
│ L1: In-Memory (Edge Function)       │
│ - Session-level entity cache        │
│ - TTL: 1 hour                       │
├─────────────────────────────────────┤
│ L2: Supabase Storage (Layout JSON)  │
│ - Merged graph serialized           │
│ - Key: sorted(paper_ids)+version    │
│ - TTL: 24 hours                     │
├─────────────────────────────────────┤
│ L3: Database (Canonical Entities)   │
│ - Persistent registry               │
│ - GIN indexes for fast lookup       │
└─────────────────────────────────────┘
```

### Phase 9 Optimization Opportunities

1. **Predictive Pre-fetching:** Load likely-needed merges based on user behavior
2. **Delta Updates:** Invalidate only changed portions of merged graph
3. **CDN Distribution:** Cache popular paper set merges at edge
4. **Lazy Entity Resolution:** Defer low-priority entity lookups

---

## Risk Register Handoff

| Risk | Severity | Mitigation Status | Phase 9 Action |
|------|----------|-------------------|----------------|
| Over-merging distinct concepts | High | Conservative thresholds | Monitor false merge rate |
| Conflict fatigue from false positives | Medium | Confidence weighting | Tune detector sensitivity |
| Registry bloat from auto-entries | Low | Periodic pruning planned | Implement cleanup job |
| Merge latency scaling poorly | Medium | Server-side computation | Profile and optimize hot paths |
| Evidence loss during merge | Low | Immutable mentions | Add validation checks |
| Temporal misordering | Low | Publication date validation | Add metadata correction UI |

---

## Recommended Next Steps for Phase 9

### Week 1: Performance Profiling
- [ ] Baseline current merge latency across paper counts
- [ ] Identify bottlenecks in entity resolution
- [ ] Measure cache effectiveness under load

### Week 2: Progressive Rendering Implementation
- [ ] Implement viewport-culled rendering
- [ ] Add conflict-priority edge ordering
- [ ] Build level-of-detail node system

### Week 3: Caching Optimizations
- [ ] Add predictive pre-fetching
- [ ] Implement delta invalidation
- [ ] Set up CDN distribution for popular merges

### Week 4: Validation and Tuning
- [ ] Re-run SVS with optimizations enabled
- [ ] Tune parameters based on user feedback
- [ ] Document performance improvements

---

## Success Criteria for Phase 9 Completion

Phase 9 will be considered complete when:

1. **Performance:** All Phase 8 SLA targets met with 2x headroom
2. **Rendering:** Progressive disclosure functional for graphs >200 nodes
3. **Caching:** ≥98% cache hit rate for repeated queries
4. **Validation:** SVS passes with no regression from Phase 8 baseline
5. **Documentation:** Updated specs reflecting optimizations

---

## Contact and Support

**Phase 8 Lead:** [Name/Slack]  
**Phase 9 Lead:** [Name/Slack]  
**Escalation Path:** Engineering Lead → CTO

**Office Hours:** Tuesdays 2-4pm UTC for transition questions

---

## Sign-off

| Role | Name | Date | Approval |
|------|------|------|----------|
| Phase 8 Lead | [Pending] | - | ☐ |
| Phase 9 Lead | [Pending] | - | ☐ |
| Engineering Lead | [Pending] | - | ☐ |
| Product Owner | [Pending] | - | ☐ |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-12 | Initial handoff document |
