# Phase 8: Entity Normalization Specification

## Overview

This document specifies the entity normalization system for multi-paper synthesis in the BeingNeuron Synapse Module. The canonical entity registry enables deduplication of entities across papers while preserving evidence diversity.

## Core Concepts

### Canonical Entity

A **canonical entity** represents a unique research concept, method, dataset, model, author, or institution normalized across multiple papers. Each canonical entity has:

- `id`: UUID primary key
- `normalized_form`: Standardized name (e.g., "Transformer")
- `entity_type`: One of concept|method|dataset|model|author|institution
- `aliases`: Array of alternative names (e.g., ["transformer architecture", "self-attention model"])
- `confidence`: Algorithm-assigned confidence score [0.0-1.0]
- `curation_status`: auto|reviewed|rejected

### Entity Mention

An **entity mention** links a raw extraction from a specific paper to a canonical entity:

- Preserves original `raw_mention` text
- Stores full `evidence_span` with char offsets
- Tracks `mention_confidence` independently

## Matching Algorithms

### Strategy 1: Exact Match

```typescript
SELECT * FROM canonical_entities 
WHERE normalized_form = $1 AND entity_type = $2
```

- Score: 1.0
- Requires review: No

### Strategy 2: Alias Match

```typescript
SELECT * FROM canonical_entities 
WHERE entity_type = $2 AND aliases @> ARRAY[$1]
```

- Score: 0.95
- Requires review: No

### Strategy 3: Fuzzy Match

Computes combined similarity score:

```
score = max(
  levenshtein_similarity * 0.5 + token_overlap * 0.5,
  best_alias_similarity
)
```

**Levenshtein Similarity:**
```
similarity = 1 - (edit_distance / max_length)
```

**Token Overlap:**
```
overlap = |tokens_A ∩ tokens_B| / max(|tokens_A|, |tokens_B|)
```

- Threshold: ≥0.85 for auto-match
- Range 0.75-0.85: Queue for review
- Below 0.75: Create new entity

### Strategy 4: Embedding-Assisted Disambiguation

For ambiguous cases (e.g., "Apple" as company vs fruit):

1. Compute sentence embedding of mention context
2. Compare against canonical entity description embeddings
3. Cosine similarity >0.90 overrides fuzzy match

*Implementation deferred to Phase 9 optimization*

### Strategy 5: New Entity Creation

When no match found:

- Create canonical entity with confidence=0.6
- Add all raw mentions as aliases
- Set curation_status='auto'
- Queue for human review if fuzzy score <0.80

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `fuzzyMatchThreshold` | 0.85 | Minimum score for auto-match |
| `reviewQueueThreshold` | 0.80 | Below this requires review |
| `embeddingSimilarityThreshold` | 0.90 | For disambiguation override |
| `minAliasLength` | 3 | Minimum alias string length |

## Database Schema

See migration `20260912100000_create_canonical_entities.sql`:

```sql
CREATE TABLE canonical_entities (
  id UUID PRIMARY KEY,
  normalized_form TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(3,2),
  curation_status TEXT DEFAULT 'auto'
);

CREATE TABLE entity_mentions (
  id UUID PRIMARY KEY,
  canonical_entity_id UUID REFERENCES canonical_entities,
  paper_id UUID REFERENCES papers,
  raw_mention TEXT NOT NULL,
  evidence_span JSONB NOT NULL
);
```

## Curation Workflow

### Automatic Entries

- Created by normalization pipeline
- Confidence <0.80 queued for review
- Can be merged/split by curators

### Review Queue

Items queued when:
- Fuzzy match score 0.75-0.85
- New auto-entity created
- Low confidence (<0.6)

Curator actions:
- **Approve**: Accept as-is
- **Reject**: Mark incorrect
- **Merge**: Combine with existing
- **Edit**: Modify normalized form

## Audit Trail

All normalization decisions logged with:
- Timestamp
- Strategy used
- Match score
- Original mention
- Resulting canonical ID

## Examples

### Valid Normalization

Input entities from 3 papers:
- Paper 1: "Transformer" (method)
- Paper 2: "transformer architecture" (method)  
- Paper 3: "self-attention model" (method)

Result: Single canonical entity
```json
{
  "id": "uuid-123",
  "normalized_form": "Transformer",
  "entity_type": "method",
  "aliases": ["transformer architecture", "self-attention model"],
  "paper_count": 3
}
```

### Invalid Merge (Scope Mismatch)

Input:
- Paper 1: "BERT" (NLP model)
- Paper 2: "BERT" (protein structure model)

Detection: Embedding similarity <0.70
Resolution: Split into separate canonical entities

## Performance Considerations

- GIN index on aliases for O(log n) lookup
- Cache results per session
- Batch processing for bulk uploads
- Lazy loading for large registries

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-12 | Initial specification |
