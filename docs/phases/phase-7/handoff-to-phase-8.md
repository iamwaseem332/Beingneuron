# Phase 7 to Phase 8 Handoff Document

## Overview

This document defines the interface contracts, integration points, and operational guidelines for transitioning from Phase 7 (Evidence Linking System) to Phase 8 (Multi-Paper Synthesis). Phase 7 delivers trustworthy single-paper evidence grounding; Phase 8 extends these capabilities across multiple documents for cross-paper knowledge synthesis.

## Interface Contracts

### Evidence API for Multi-Paper Merging

Phase 8 consumes normalized evidence spans from Phase 7 via the following contract:

```typescript
// NormalizedEvidenceSpan - Extended for cross-paper alignment
interface NormalizedEvidenceSpan {
  // Phase 7 core fields
  chunkId: string;
  startChar: number;
  endChar: number;
  pageNumber: number;
  confidence: number;
  
  // Phase 8 additions for cross-paper synthesis
  paperId: string;           // Unique paper identifier
  extractionVersion: string; // Schema version for compatibility
  normalizedText: string;    // Canonical form for deduplication
  semanticHash: string;      // Content hash for duplicate detection
}
```

**Integration Point**: Phase 8's `CrossPaperMerger` component calls `EvidenceAPI.getNormalizedSpans(paperIds)` to retrieve spans for merging.

### Confidence Threshold Recommendations

Phase 8 should filter evidence spans by confidence during merge operations:

| Merge Operation | Min Confidence | Rationale |
|-----------------|----------------|-----------|
| Entity Deduplication | ≥0.85 | High precision required for identity resolution |
| Relation Validation | ≥0.75 | Moderate tolerance for exploratory synthesis |
| Claim Verification | ≥0.90 | Critical claims need strongest evidence |
| Exploratory Browsing | ≥0.60 | Lower threshold acceptable for discovery |

**Implementation**:
```typescript
const spans = await evidenceAPI.getNormalizedSpans(paperIds);
const highConfidenceSpans = spans.filter(s => s.confidence >= 0.85);
```

## Span Normalization Hooks

Phase 7 provides hooks for Phase 8 to normalize spans across papers:

### Hook 1: Text Canonicalization
```typescript
evidenceAPI.registerNormalizer({
  name: 'lowercase-whitespace-normalized',
  normalize: (text: string): string => 
    text.toLowerCase().replace(/\s+/g, ' ').trim()
});
```

### Hook 2: Semantic Hashing
```typescript
const hash = await evidenceAPI.computeSemanticHash(span.excerpt);
// Returns SHA-256 hash of normalized text for duplicate detection
```

### Hook 3: Cross-Paper Alignment
```typescript
const alignments = await evidenceAPI.findAlignedSpans(
  sourceSpan,
  targetPaperIds,
  { minConfidence: 0.8, similarityThreshold: 0.9 }
);
// Returns spans in other papers with semantically similar content
```

## Sync Protocol Extensions

Phase 7's `SyncManager` extends to support multi-document viewers:

### Multi-Paper Sync State
```typescript
interface MultiPaperSyncState extends SyncState {
  activePaperId: string | null;     // Currently focused paper
  linkedPaperIds: string[];         // Papers with linked evidence
  crossPaperHighlights: Array<{
    paperId: string;
    regions: HighlightRegion[];
  }>;
}
```

### Synchronization Flow
1. User selects node representing cross-paper concept
2. Phase 8 queries `evidenceAPI.findAlignedSpans()` for all papers
3. `SyncManager` updates state with `activePaperId` and `linkedPaperIds`
4. PDF viewer loads primary paper, queues secondary papers
5. Highlights rendered across all papers simultaneously
6. Navigation controls cycle through papers (Prev Paper / Next Paper)

## Layout Cache Invalidation

Phase 7's layout cache must be invalidated when Phase 8 performs merges:

### Invalidation Triggers
| Event | Cache Action | Scope |
|-------|--------------|-------|
| New paper added to synthesis | Invalidate affected nodes | Paper-specific |
| Cross-paper relation created | Recompute layout | Graph-wide |
| Entity deduplication merged | Update node positions | Affected clusters |
| Evidence span updated | Refresh highlights | Span-specific |

### Invalidation API
```typescript
layoutCache.invalidate({
  type: 'cross_paper_merge',
  affectedPaperIds: ['paper-1', 'paper-2'],
  affectedNodeIds: ['node-456', 'node-789'],
  reason: 'entity_deduplication'
});
```

## Performance Budgets for Phase 8

Phase 8 features must operate within these performance budgets to preserve Phase 7's stability guarantees:

| Metric | Budget | Measurement Point |
|--------|--------|-------------------|
| Cross-paper sync latency | ≤400ms | Selection to multi-highlight render |
| Memory growth per paper | ≤15MB | Heap delta after loading paper |
| Highlight render FPS (multi-paper) | ≥50fps | During simultaneous scroll |
| Layout recomputation time | ≤600ms | After merge operation |

**Monitoring**: Phase 8 must instrument these metrics and alert if budgets exceeded.

## Known Limitations from Phase 7

Phase 8 developers must account for these Phase 7 limitations:

### Limitation 1: Table Cell Highlighting
- **Issue**: Highlights misaligned in complex table structures (4 cases in validation)
- **Workaround**: Use page-level fallback for table-heavy spans
- **Fix Timeline**: Phase 7.1 iteration

### Limitation 2: Cross-Page Spans
- **Issue**: Spans should not cross page boundaries (Phase 3 constraint)
- **Impact**: Long sentences spanning pages may have fragmented highlights
- **Workaround**: Display warning when fragmentation detected

### Limitation 3: Mobile Swipe Sensitivity
- **Issue**: Bottom sheet swipe gesture threshold needs tuning
- **Impact**: Occasional accidental dismissals on mobile
- **Workaround**: Increase touch target size, add confirmation dialog

### Limitation 4: Multi-Column Layouts
- **Issue**: Coordinate precision reduced in dense multi-column layouts
- **Impact**: 18/847 spans had <80% overlap in validation
- **Workaround**: Flag low-confidence mappings for manual review

## Operational Guidelines

### Batch Processing Recommendations

When processing multiple papers for synthesis:

```typescript
// Recommended batch size for evidence normalization
const BATCH_SIZE = 10; // papers per batch
const CONCURRENCY = 3; // parallel batches

for (const batch of chunk(paperIds, BATCH_SIZE)) {
  await Promise.all(
    batch.map(paperId => evidenceAPI.normalizeSpans(paperId))
  );
}
```

### Error Handling Strategy

```typescript
try {
  const alignedSpans = await evidenceAPI.findAlignedSpans(...);
} catch (error) {
  if (error instanceof SpanMapperError) {
    // Fallback to page-level highlights
    logger.warn('Span mapping failed, using page fallback', { paperId });
  } else if (error instanceof SyncTimeoutError) {
    // Retry with exponential backoff
    await retryWithBackoff(() => evidenceAPI.findAlignedSpans(...));
  } else {
    // Surface to user
    showErrorToast('Evidence synchronization failed');
  }
}
```

### Monitoring and Alerting

Phase 8 should monitor these Phase 7-derived metrics:

| Metric | Warning Threshold | Critical Threshold | Alert Channel |
|--------|-------------------|-------------------|---------------|
| Sync failure rate | >5% | >10% | Slack #ops-alerts |
| Avg coordinate precision | <90% | <80% | Email daily digest |
| Evidence panel load time | >500ms | >1000ms | Datadog dashboard |
| Accessibility audit failures | >0 | >0 | Block deployment |

## Testing Requirements for Phase 8

Phase 8 integration tests must verify:

- [ ] Cross-paper evidence alignment preserves Phase 7 precision targets
- [ ] Multi-paper sync doesn't introduce feedback loops
- [ ] Performance budgets met under load (20+ papers)
- [ ] Accessibility compliance maintained in multi-document view
- [ ] Layout cache invalidation triggers correctly on merge events

## Migration Path

### Phase 8.0 (Initial Release)
- Consume Phase 7 APIs as documented
- Implement basic cross-paper alignment
- Single-document evidence panels

### Phase 8.1 (Enhanced Synthesis)
- Leverage semantic hashing for deduplication
- Multi-paper synchronized highlighting
- Advanced navigation across linked evidence

### Phase 8.2 (Full Integration)
- Real-time cross-paper relation validation
- Automated claim verification across corpus
- Unified evidence provenance visualization

## Sign-Off Checklist

- [ ] Engineering Lead reviewed interface contracts
- [ ] QA Lead validated test requirements
- [ ] Performance team approved budgets
- [ ] Accessibility team audited extension points
- [ ] Product Owner approved migration timeline

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-10 | Phase 7 Team | Initial handoff document |
