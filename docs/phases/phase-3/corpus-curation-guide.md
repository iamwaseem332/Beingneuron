# Phase 3: Corpus Curation Guide

## Executive Summary

This document defines the protocol for curating and annotating a gold standard corpus for validating PDF parsing, chunking, and future entity extraction phases of the BeingNeuron Synapse module. The corpus serves as the single source of truth for objective quality measurement in Phases 4-10.

**Status**: ✅ Protocol Defined - Ready for Annotation Execution  
**Storage**: Private S3 bucket (not committed to Git)  
**Version**: v1.0

---

## 1. Paper Selection Criteria

The corpus consists of **20 research papers** selected to maximize diversity across five dimensions:

### 1.1 Domain Diversity

| Domain | Count | Rationale |
|--------|-------|-----------|
| ML/NLP | 4 | Core BeingNeuron use case; heavy terminology |
| Computer Vision | 4 | Diagram-heavy, different layout patterns |
| Neuroscience | 3 | Complex methodology descriptions |
| Biology | 3 | Table-intensive, specialized nomenclature |
| Physics | 3 | Formula-dense, multi-column common |
| Social Science | 3 | Single-column, prose-heavy baseline |

### 1.2 Structural Diversity

| Structure Type | Count | Characteristics |
|----------------|-------|-----------------|
| Single-column | 5 | Baseline layout, easier parsing |
| Two-column | 5 | Tests reading order fidelity |
| Heavy-table | 5 | ≥8 tables per paper |
| Formula-dense | 5 | ≥20 formulas per paper |

### 1.3 Length Distribution

| Length Category | Pages | Count |
|-----------------|-------|-------|
| Short | <10 | 5 |
| Medium | 10-30 | 10 |
| Long | >30 | 5 |

### 1.4 Source Diversity

| Source | Count | Access Method |
|--------|-------|---------------|
| arXiv | 10 | Open access PDFs |
| ACM/IEEE | 5 | Institutional subscription |
| Springer/Nature | 5 | Publisher PDFs |

### 1.5 Recency Distribution

| Era | Count | Rationale |
|-----|-------|-----------|
| Post-2020 | 15 | Modern typesetting practices |
| Seminal classics | 5 | Historical importance (e.g., Transformer paper, ResNet) |

---

## 2. Annotation Protocol

Each paper undergoes **four annotation passes** by trained annotators. Minimum **2 annotators per paper** for inter-rater reliability assessment.

### Pass 1: Structural Annotation

**Objective**: Mark document structure elements with bounding boxes and reading order.

**Elements to Annotate**:
- Section boundaries (start/end page, character offsets)
- Heading levels (1-4)
- Table extents (bounding box, row/column counts)
- Formula locations (inline vs display, bounding box)
- Figure captions
- Reference list extent

**Output Schema**: `structure.gold.json`

```json
{
  "$schema": "./schemas/structure.schema.json",
  "paperId": "test-001",
  "annotator": "annotator-A",
  "timestamp": "2025-01-06T10:30:00Z",
  "sections": [
    {
      "id": "sec-1",
      "title": "1. Introduction",
      "level": 1,
      "startPage": 1,
      "endPage": 2,
      "charStart": 0,
      "charEnd": 1247,
      "boundingBox": { "x": 72, "y": 180, "width": 450, "height": 40 }
    }
  ],
  "tables": [
    {
      "id": "tab-1",
      "pageNumber": 3,
      "boundingBox": { "x": 72, "y": 200, "width": 450, "height": 180 },
      "rowCount": 5,
      "colCount": 4,
      "hasHeader": true
    }
  ],
  "formulas": [
    {
      "id": "eq-1",
      "pageNumber": 2,
      "type": "display",
      "boundingBox": { "x": 150, "y": 400, "width": 300, "height": 40 },
      "latex": "E = mc^2"
    }
  ]
}
```

### Pass 2: Entity Annotation

**Objective**: Tag named entities with exact text spans and controlled vocabulary types.

**Entity Types** (from Phase 2 schema):
- `concept`: Abstract ideas, theories, frameworks
- `method`: Algorithms, techniques, procedures
- `dataset`: Named datasets, corpora, benchmarks
- `model`: Specific model architectures or instances
- `author`: Person names
- `institution`: Organizations, universities, labs
- `metric`: Evaluation metrics, measurements

**Annotation Rules**:
- Mark exact text span (no partial words)
- Record page number and character offsets
- Use most specific type applicable
- Nested entities allowed (e.g., institution within author affiliation)

**Output Schema**: `entities.gold.json`

```json
{
  "$schema": "./schemas/entities.schema.json",
  "paperId": "test-001",
  "annotator": "annotator-B",
  "timestamp": "2025-01-06T14:00:00Z",
  "entities": [
    {
      "id": "ent-1",
      "text": "Transformer",
      "type": "model",
      "pageNumber": 1,
      "charStart": 245,
      "charEnd": 256,
      "confidence": 0.95
    },
    {
      "id": "ent-2",
      "text": "GLUE benchmark",
      "type": "dataset",
      "pageNumber": 5,
      "charStart": 1823,
      "charEnd": 1837,
      "confidence": 0.98
    }
  ]
}
```

### Pass 3: Relation Annotation

**Objective**: Identify semantic relationships between entities with supporting evidence.

**Relation Types**:
- `USES_METHOD`: Entity A uses method B
- `EVALUATES_ON`: Model/dataset evaluated on benchmark
- `OUTPERFORMS`: Entity A outperforms entity B
- `BASED_ON`: Entity A is based on entity B
- `AUTHORED_BY`: Paper/method authored by person
- `AFFILIATED_WITH`: Person affiliated with institution

**Evidence Requirement**: Each relation must cite a specific text span that explicitly supports the relationship.

**Output Schema**: `relations.gold.json`

```json
{
  "$schema": "./schemas/relations.schema.json",
  "paperId": "test-001",
  "annotator": "annotator-C",
  "timestamp": "2025-01-06T16:30:00Z",
  "relations": [
    {
      "id": "rel-1",
      "subject": "ent-1",
      "predicate": "EVALUATES_ON",
      "object": "ent-2",
      "evidenceSpan": {
        "pageNumber": 5,
        "charStart": 1800,
        "charEnd": 1890,
        "text": "We evaluate the Transformer model on the GLUE benchmark..."
      },
      "confidence": 0.92
    }
  ]
}
```

### Pass 4: Evidence Span Verification

**Objective**: Verify that every cited passage actually supports the annotation.

**Process**:
1. Review each entity/relation with its evidence span
2. Assign confidence score (0.0-1.0)
3. Flag ambiguous cases for senior adjudicator
4. Note weak evidence for potential exclusion

**Output Schema**: `evidence.gold.json`

```json
{
  "$schema": "./schemas/evidence.schema.json",
  "paperId": "test-001",
  "annotator": "annotator-D",
  "timestamp": "2025-01-06T18:00:00Z",
  "verifications": [
    {
      "annotationId": "ent-1",
      "annotationType": "entity",
      "confidenceScore": 0.95,
      "isSupported": true,
      "notes": ""
    },
    {
      "annotationId": "rel-1",
      "annotationType": "relation",
      "confidenceScore": 0.75,
      "isSupported": true,
      "notes": "Evidence is implicit rather than explicit statement"
    }
  ]
}
```

---

## 3. Inter-Rater Reliability

### 3.1 Metrics

**Cohen's Kappa (κ)** measures agreement beyond chance:

- κ ≥ 0.8: Excellent agreement (target for entities)
- κ ≥ 0.75: Good agreement (target for relations)
- κ < 0.6: Poor agreement → retraining required

### 3.2 Calculation

For each paper with 2+ annotators:
```python
from sklearn.metrics import cohen_kappa_score

# For entities
kappa_entities = cohen_kappa_score(
    annotator_A_entity_types,
    annotator_B_entity_types
)

# For relations
kappa_relations = cohen_kappa_score(
    annotator_A_relation_labels,
    annotator_B_relation_labels
)
```

### 3.3 Disagreement Resolution

When κ falls below target:
1. Senior annotator reviews disagreed items
2. Consensus reached through discussion
3. Final gold standard reflects consensus
4. Disagreement rate documented for quality report

---

## 4. Tool Configuration

### 4.1 Label Studio Setup

**Recommended Tool**: Label Studio (self-hosted)

**Installation**:
```bash
pip install label-studio
label-studio start
```

**Project Configuration**:
```json
{
  "title": "BeingNeuron Gold Corpus",
  "description": "PDF parsing and entity annotation for Phase 3-10 validation",
  "label_config": "<View>...</View>"
}
```

**Label Config Template** (for entities):
```xml
<View>
  <Labels name="labels" toName="text">
    <Label value="concept" background="#FFA500"/>
    <Label value="method" background="#008000"/>
    <Label value="dataset" background="#0000FF"/>
    <Label value="model" background="#800080"/>
    <Label value="author" background="#FFC0CB"/>
    <Label value="institution" background="#A52A2A"/>
    <Label value="metric" background="#FFD700"/>
  </Labels>
  <Text name="text" value="$text"/>
</View>
```

### 4.2 Export Format

Configure Label Studio to export JSON matching schemas in `benchmarks/gold/schemas/`.

---

## 5. Quality Control Procedures

### 5.1 Pre-Annotation Training

All annotators must complete:
1. Tutorial on entity types with examples
2. Practice annotation on 2 non-corpus papers
3. Pass quiz with ≥90% accuracy

### 5.2 Ongoing Calibration

Weekly calibration sessions:
- Review 5 randomly sampled annotations per annotator
- Discuss edge cases and ambiguities
- Update guidelines as needed

### 5.3 Adversarial Examples

Include 10% adversarial examples in training set:
- Ambiguous table boundaries
- Nested formulas
- Multi-word entities with interruptions
- Implicit relations requiring inference

---

## 6. Storage and Versioning

### 6.1 Storage Location

**Primary**: Private S3 bucket (`beingneuron-gold-corpus`)

**Structure**:
```
s3://beingneuron-gold-corpus/
├── v1.0/
│   ├── papers/           # Original PDFs
│   ├── annotations/      # Gold JSON files
│   └── manifests/        # Version manifests
└── latest -> v1.0/
```

### 6.2 Version Manifest

Each version includes `manifest.json`:
```json
{
  "version": "v1.0",
  "createdAt": "2025-01-06T00:00:00Z",
  "paperCount": 20,
  "annotatorCount": 6,
  "avgKappaEntities": 0.84,
  "avgKappaRelations": 0.78,
  "sha256Manifest": "abc123..."
}
```

### 6.3 Access Control

- Read access: Phase 3-10 team members
- Write access: Lead annotator only
- Audit logging: All downloads logged

---

## 7. Usage in Validation

### 7.1 Parser Validation

Compare parser output against `structure.gold.json`:
- Table cell recovery rate
- Formula renderability
- Heading level precision
- Reading order fidelity (Kendall τ)

### 7.2 Chunking Validation

Compare chunk boundaries against section annotations:
- Section boundary preservation %
- Atomic unit integrity %
- Semantic coherence rating (manual 1-5 scale)

### 7.3 Future Extraction Validation (Phase 4+)

Compare extracted entities against `entities.gold.json`:
- Precision, Recall, F1 scores
- Evidence span overlap ≥0.8 = correct

---

## Appendix A: Annotation Guidelines Excerpt

### When to Mark as `method` vs `concept`

**Mark as `method`** if:
- Describes a specific algorithm or procedure
- Has implementation details
- Can be executed/applied

**Mark as `concept`** if:
- Abstract theoretical framework
- General idea without specific implementation
- Philosophical or conceptual discussion

**Example**:
- "Backpropagation" → `method` (specific algorithm)
- "Gradient descent principle" → `concept` (theoretical idea)

### Handling Nested Entities

**Rule**: Annotate the most specific complete entity.

**Example**:
"In the Transformer model by Vaswani et al."
- "Transformer" → `model`
- "Vaswani" → `author`
- NOT "Transformer model by Vaswani" as single entity

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-06  
**Author**: Phase 3 Implementation Team  
**Review Status**: ✅ Approved for Annotation Execution
