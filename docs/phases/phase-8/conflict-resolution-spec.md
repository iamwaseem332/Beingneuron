# Phase 8: Conflict Resolution Specification

## Overview

This document specifies the conflict detection and resolution system for multi-paper synthesis. Research contradicts; our system surfaces disagreements rather than hiding them, enabling users to understand scientific debates.

## Conflict Taxonomy

### Type 1: Direct Contradiction

**Definition:** Two papers make opposing claims about the same entity pair.

**Examples:**
- Paper A: "Method X **improves** accuracy"
- Paper B: "Method X **degrades** accuracy"

**Detection:**
```typescript
if (edge1.type === 'contradicts' || edge2.type === 'contradicts') {
  if (edge1.source === edge2.source && edge1.target === edge2.target) {
    return { type: 'direct_contradiction', ... }
  }
}
```

**Resolution Strategy:** `weight_by_evidence`
- Preserve both edges
- Compute evidence weights for each side
- UI displays weighted comparison

---

### Type 2: Implicit Disagreement

**Definition:** Papers use different approaches for same task without explicit comparison.

**Examples:**
- Paper A: Uses Dataset D1 for Task T
- Paper B: Uses Dataset D2 for Task T (no mention of D1)

**Detection:**
```typescript
const taskEdges = edges.filter(e => 
  e.type === 'evaluates_on' && target.isTask
);
const grouped = groupBy(taskEdges, 'target');
for (const [task, edges] of grouped) {
  if (edges.length >= 2 && !edges.some(e => e.paperCount > 1)) {
    return { type: 'implicit_disagreement', ... }
  }
}
```

**Resolution Strategy:** `preserve_both`
- Surface as "alternative approaches" cluster
- No automatic reconciliation

---

### Type 3: Temporal Evolution

**Definition:** Older paper identifies limitation; newer paper addresses it.

**Examples:**
- Paper A (2020): "Transformer has O(n²) complexity **limitation**"
- Paper B (2023): "Linear Transformer **overcomes** quadratic complexity"

**Detection:**
```typescript
const improvementEdges = edges.filter(e => 
  e.type === 'improves' || e.type === 'extends'
);
for (const edge of improvementEdges) {
  const papers = getPapers(edge);
  if (papers.length >= 2) {
    const sorted = sortByDate(papers);
    if (hasLimitationClaim(sorted[0]) && hasAddressClaim(sorted[1])) {
      return { type: 'temporal_evolution', ... }
    }
  }
}
```

**Resolution Strategy:** `temporal_ordering`
- Create timeline visualization
- Mark older claim as "superseded" with link to newer work

---

### Type 4: Scope Mismatch

**Definition:** Same entity name but different semantic scope/meaning.

**Examples:**
- Paper A: "BERT" = NLP language model
- Paper B: "BERT" = Protein structure model (Biological ERT)

**Detection:**
```typescript
const nodeGroups = groupBy(nodes, 'normalizedForm');
for (const [form, nodes] of nodeGroups) {
  if (nodes.length >= 2) {
    for (const [n1, n2] of combinations(nodes, 2)) {
      const similarity = computeEmbeddingSimilarity(n1, n2);
      if (similarity < 0.70) {
        return { type: 'scope_mismatch', ... }
      }
    }
  }
}
```

**Resolution Strategy:** `split_entity`
- Split into separate canonical entities
- Queue for human curator review
- Add disambiguation suffix (e.g., "BERT (NLP)", "BERT (Protein)")

---

## Evidence Weighting Formula

```
weight = mention_confidence × log₁₀(citation_count + 1) × recency_factor
```

### Components

| Component | Range | Description |
|-----------|-------|-------------|
| `mention_confidence` | 0.0-1.0 | From LLM extraction confidence |
| `citation_count` | 0-∞ | Paper citation count (log-scaled) |
| `recency_factor` | 0.1-1.0 | Decay based on publication age |

### Recency Factor Calculation

```typescript
function computeRecencyFactor(publicationDate: Date): number {
  const yearsOld = (new Date().getFullYear() - publicationDate.getFullYear());
  // Half-life of 5 years
  return Math.max(0.1, Math.pow(0.8, yearsOld));
}
```

### Example Calculation

Paper with:
- Mention confidence: 0.90
- Citation count: 100
- Published 2 years ago (recency = 0.8² = 0.64)

```
weight = 0.90 × log₁₀(101) × 0.64
       = 0.90 × 2.00 × 0.64
       = 1.15
```

---

## Conflict Resolution Strategies

| Strategy | When Used | Action |
|----------|-----------|--------|
| `weight_by_evidence` | Direct contradiction | Display both with weighted confidence |
| `preserve_both` | Implicit disagreement | Show as alternatives |
| `temporal_ordering` | Temporal evolution | Timeline view, mark superseded |
| `split_entity` | Scope mismatch | Create separate entities |

---

## Conflict Metadata Schema

```typescript
interface ConflictInfo {
  type: 'direct_contradiction' | 'implicit_disagreement' | 
        'temporal_evolution' | 'scope_mismatch';
  paperIds: string[];           // Papers involved in conflict
  evidenceWeights: number[];    // Computed weight per side
  resolved?: boolean;           // True if human curator resolved
  resolution?: {
    strategy: string;
    rationale: string;
    resolvedAt: string;
    resolvedBy: string;         // User ID if manual
  };
}
```

Stored in `merged_edges.metadata.conflicts` JSONB column.

---

## Human Override Protocol

Curators can override automatic conflict resolution via admin interface.

### Allowed Actions

1. **Merge Entities**: Combine split entities if mismatch was false positive
2. **Split Entities**: Separate merged entities if scope differs
3. **Mark Resolved**: Accept automatic resolution
4. **Add Rationale**: Document reasoning for future reference

### Audit Trail

All overrides logged:
```json
{
  "conflictId": "uuid",
  "originalResolution": "split_entity",
  "overrideResolution": "preserve_both",
  "rationale": "Same model, different evaluation contexts",
  "resolvedBy": "user-uuid",
  "resolvedAt": "2026-09-12T14:30:00Z"
}
```

---

## UI Integration

### Conflict Indicators

| Visual | Meaning |
|--------|---------|
| 🟡 Yellow edge | Potential conflict (auto-detected) |
| 🔴 Red edge | Direct contradiction |
| 🔵 Blue edge | Temporal evolution |
| ⚪ Gray dashed | Scope mismatch (split pending) |

### Conflict Panel

When user clicks conflicting edge:
```
┌─────────────────────────────────────┐
│ ⚠️ Conflicting Claims Detected     │
├─────────────────────────────────────┤
│ Claim A (Weight: 1.15)             │
│ "Method X improves accuracy by 15%"│
│ Source: Paper [1], [3]             │
│                                     │
│ Claim B (Weight: 0.82)             │
│ "Method X shows no improvement"    │
│ Source: Paper [2]                  │
│                                     │
│ [View Full Evidence] [Report Issue]│
└─────────────────────────────────────┘
```

---

## Validation Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Contradiction Detection Recall | ≥0.85 | % gold conflicts detected |
| False Positive Rate | ≤0.10 | % flagged that aren't real |
| Evidence Weight Correlation | ≥0.75 | Spearman ρ vs human judgment |
| Temporal Ordering Accuracy | ≥0.90 | % evolution chains correct |

---

## Examples

### Example 1: Direct Contradiction

**Input:**
- Paper 1: "Attention mechanism **improves** translation quality"
- Paper 2: "Attention mechanism **contradicts** prior SOTA claims"

**Output:**
```json
{
  "conflicts": [{
    "type": "direct_contradiction",
    "paperIds": ["paper-1", "paper-2"],
    "evidenceWeights": [1.23, 0.95],
    "resolved": false
  }]
}
```

### Example 2: Temporal Evolution

**Input:**
- Paper A (2019): "Limited by GPU memory"
- Paper B (2022): "Overcomes memory limitations via gradient checkpointing"

**Output:**
```json
{
  "conflicts": [{
    "type": "temporal_evolution",
    "paperIds": ["paper-a", "paper-b"],
    "evidenceWeights": [0.65, 1.10],
    "resolution": {
      "strategy": "temporal_ordering",
      "rationale": "Later work addresses earlier limitation"
    }
  }]
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-12 | Initial specification |
