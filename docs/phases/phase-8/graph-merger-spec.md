# Phase 8: Graph Merger Specification

## Overview

This document specifies the cross-document graph merging system that combines extracted knowledge from multiple papers into a unified knowledge graph while preserving semantic meaning and evidence provenance.

## Merge Strategies by Relation Type

| Relation Type | Strategy | Rationale |
|--------------|----------|-----------|
| `uses` | Union | Deduplicate, aggregate evidence |
| `evaluates_on` | Union | Same dataset usage across papers |
| `improves` | Union | Preserve directionality, flag contradictions |
| `extends` | Union | Build on prior work |
| `derives_from` | Transitive Closure | Compute inferred relationships |
| `contradicts` | Preserve All | **Critical**: Never merge opposing claims |
| `co_occurs` | Multi-Paper Required | Only keep if ≥2 papers support |

## Core Algorithm

### Step 1: Node Normalization

```typescript
for each paper in papers:
  for each entity in paper.entities:
    canonical = normalizer.resolve(entity, paper.id)
    if canonical not in mergedNodes:
      create merged node with:
        - id: canonical.id
        - normalizedForm: canonical.normalized_form
        - paperCount: 0
        - evidenceSpans: []
    mergedNodes[canonical].paperCount++
    mergedNodes[canonical].evidenceSpans.push(...entity.evidenceSpans)
```

### Step 2: Edge Aggregation

```typescript
for each paper in papers:
  for each relation in paper.relations:
    sourceCanon = resolve(relation.sourceEntityId)
    targetCanon = resolve(relation.targetEntityId)
    strategy = getStrategy(relation.type)
    
    switch strategy:
      case 'union':
        if edge exists:
          edge.paperCount++
          edge.evidenceSpans.push(...relation.evidenceSpans)
          edge.isExplicit = edge.isExplicit OR relation.isExplicitlyStated
        else:
          create new edge
      
      case 'preserve_all':
        // Contradictions: always create separate edge
        create unique edge per paper with hasConflict=true
      
      case 'multi_paper_required':
        // co_occurs: filter post-merge
        if edge exists:
          edge.paperCount++
        else:
          create edge (may be filtered later)
```

### Step 3: Post-Merge Filtering

```typescript
filteredEdges = allEdges.filter(edge => {
  if edge.type === 'co_occurs':
    return edge.paperCount >= 2  // Require multi-paper support
  return true
})
```

## Merged Node Schema

```typescript
interface MergedNode {
  id: string;                    // Canonical entity ID
  normalizedForm: string;        // Standardized name
  type: EntityType;
  paperCount: number;            // Number of papers mentioning
  evidenceSpans: EvidenceSpan[]; // All evidence with paper attribution
  confidence: number;            // Max confidence across mentions
  paperIds: string[];            // List of paper IDs
}
```

## Merged Edge Schema

```typescript
interface MergedEdge {
  id: string;
  source: string;                // Source canonical entity ID
  target: string;                // Target canonical entity ID
  type: RelationType;
  paperCount: number;
  evidenceSpans: EvidenceSpan[]; // All evidence with paper attribution
  isExplicit: boolean;           // True if any paper states explicitly
  hasConflict: boolean;          // True if contradicts other edge
  metadata?: {
    conflicts?: ConflictInfo[];
  };
}
```

## Conflict Detection

### Direct Contradiction

Detected when:
- Same entity pair has both `X improves Y` and `X contradicts Y`
- Or opposing sentiment relations

Resolution: Preserve both edges, mark `hasConflict=true`

### Implicit Disagreement

Detected when:
- Paper A uses Method X for Task T
- Paper B uses Method Y for Task T (without mentioning X)

Resolution: Surface as "alternative approaches" cluster

### Temporal Evolution

Detected when:
- Older paper claims limitation L
- Newer paper has "addresses L" or "overcomes L" relation

Resolution: Create timeline view, mark older as superseded

### Scope Mismatch

Detected when:
- Same normalized form but embedding similarity <0.70

Resolution: Split canonical entity, queue for review

## Evidence Weighting Formula

```
weight = mention_confidence × log10(citation_count + 1) × recency_factor
```

Where:
- `mention_confidence`: [0.0-1.0] from extraction
- `citation_count`: Paper citation count (log-scaled)
- `recency_factor`: [0.1-1.0] based on publication age

## Caching Strategy

Cache key: `sorted(paper_ids) + registry_version`

```typescript
const cacheKey = `${papers.map(p => p.id).sort().join(':')}:${registryVersion}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const result = await merge(papers, registryVersion);
await cache.set(cacheKey, result, { ttl: 3600 });
```

Invalidation triggers:
- Registry update (any entity modified)
- New extraction for any paper in set
- Manual cache clear

## Performance Targets

| Metric | Target |
|--------|--------|
| 5-paper merge latency (p95) | ≤3s |
| Registry lookup (p99) | ≤200ms |
| Memory footprint (10 papers) | ≤150MB |
| Cache hit rate | ≥95% |

## Example: Merging 3 Papers

### Input

**Paper 1:**
- Entities: Transformer (method), BERT (model)
- Relations: Transformer → uses → BERT

**Paper 2:**
- Entities: transformer architecture (method), BERT (model)
- Relations: transformer architecture → extends → BERT

**Paper 3:**
- Entities: GPT-3 (model), Transformer (method)
- Relations: GPT-3 → derives_from → Transformer

### Output

**Merged Nodes:**
```json
[
  {
    "id": "canon-123",
    "normalizedForm": "Transformer",
    "type": "method",
    "paperCount": 3,
    "evidenceSpans": [...6 spans from 3 papers...]
  },
  {
    "id": "canon-456",
    "normalizedForm": "BERT",
    "type": "model",
    "paperCount": 2,
    "evidenceSpans": [...4 spans from 2 papers...]
  },
  {
    "id": "canon-789",
    "normalizedForm": "GPT-3",
    "type": "model",
    "paperCount": 1,
    "evidenceSpans": [...2 spans from 1 paper...]
  }
]
```

**Merged Edges:**
```json
[
  {
    "source": "canon-123",
    "target": "canon-456",
    "type": "uses",
    "paperCount": 2,
    "isExplicit": true
  },
  {
    "source": "canon-123",
    "target": "canon-456",
    "type": "extends",
    "paperCount": 1,
    "isExplicit": true
  },
  {
    "source": "canon-789",
    "target": "canon-123",
    "type": "derives_from",
    "paperCount": 1,
    "isExplicit": true
  }
]
```

## Error Handling

| Error | Response |
|-------|----------|
| Unresolved entity | Skip edge, log warning |
| Empty paper set | Return empty graph |
| Registry unavailable | Fail with retry |
| Cache corruption | Recompute, refresh cache |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-12 | Initial specification |
