# Benchmark Corpus Curation Guidelines

## Overview

This directory contains the research paper corpus used for benchmarking the BeingNeuron Synapse module across all 10 improvement phases. The corpus must remain consistent across phases to enable valid before/after comparisons.

## Paper Selection Criteria

### Required Characteristics

Select 5-10 papers that collectively represent the diversity of real-world research documents:

1. **Page Count Distribution**
   - At least 2 short papers (<8 pages)
   - At least 3 medium papers (8-20 pages)
   - At least 2 long papers (>20 pages)
   - At least 1 very long paper (>50 pages)

2. **Format Diversity**
   - Single-column layout papers
   - Double-column layout papers
   - Papers with mixed layouts (e.g., single-column abstract, double-column body)

3. **Content Complexity**
   - **Table Density**: Include papers with 0, 1-5, and >10 tables
   - **Formula Count**: Include papers with minimal math, moderate equations, and heavy mathematical content
   - **Citation Density**: Include papers with sparse (<20 citations) and dense (>100 citations) bibliographies

4. **Domain Variety**
   - Machine Learning / AI papers
   - Systems / Infrastructure papers
   - Applied / Domain-specific papers
   - Survey / Review papers

5. **Edge Cases**
   - Papers with supplementary materials
   - Papers with appendices
   - Papers with unusual formatting (e.g., wide tables, multi-part figures)
   - Scanned papers (if OCR is in scope)

### Exclusion Criteria

Do NOT include papers that:
- Have known copyright restrictions preventing local storage
- Are corrupted or have missing pages
- Use non-standard encodings that break PDF parsers
- Are primarily image-based without selectable text (unless testing OCR)

## Adding Papers to Corpus

1. Place PDF files in `benchmarks/corpus/papers/`
2. Name files using pattern: `paper-NN-short-identifier.pdf` (e.g., `paper-01-attention-is-all-you-need.pdf`)
3. Update `metadata.json` with complete metadata for each paper
4. Compute SHA256 hash: `shasum -a 256 paper-01-*.pdf`

## Metadata Schema

Each entry in `metadata.json` must include:

```json
{
  "paperId": "paper-01",
  "title": "Attention Is All You Need",
  "fileName": "paper-01-attention-is-all-you-need.pdf",
  "pageCount": 15,
  "tableDensity": "low",
  "formulaCount": 12,
  "citationCount": 47,
  "sha256": "abc123..."
}
```

Where:
- `paperId`: Unique identifier matching gold standard annotations
- `title`: Full paper title
- `fileName`: Exact filename in `papers/` directory
- `pageCount`: Total number of pages
- `tableDensity`: "none" | "low" (1-5) | "medium" (6-10) | "high" (>10)
- `formulaCount`: Approximate number of displayed equations
- `citationCount`: Number of references in bibliography
- `sha256`: SHA256 hash of PDF file (prevents accidental modification)

## Version Control

- PDF files are NOT committed to Git (added to `.gitignore`)
- `metadata.json` IS committed and versioned
- Change `corpusVersion` in `metadata.json` when adding/removing papers
- Document corpus changes in this README

## Gold Standard Annotation

After curating corpus, annotate each paper for:
- Entities (concepts, methods, datasets, claims, authors)
- Relations (used, extends, contradicts, cites, etc.)
- Evidence spans (text locations supporting each entity/relation)

See `../gold/` directory for annotation schema details.

## Security Notes

- Store papers locally only; do not commit to repository
- Ensure papers are obtained legally (open access, institutional subscription, author permission)
- Redact any sensitive information if present in test papers
