# BeingNeuron Synapse Benchmarking Guide

## Overview

This benchmarking framework enables objective before/after measurement across all 10 improvement phases of the BeingNeuron Synapse module. It measures extraction quality, graph rendering performance, and database efficiency.

**WARNING: Never run benchmarks against production without explicit approval.** Always use staging environment.

## Prerequisites

### System Requirements

- Node.js v20.x or later
- npm v10.x or later
- Playwright browsers installed

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Environment Configuration

Create `.env.benchmark` file in the project root (NOT committed to Git):

```bash
cp .env.benchmark.example .env.benchmark
```

Edit `.env.benchmark` with your values:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Benchmark User Authentication
BENCHMARK_USER_JWT=eyJhbGc...  # Valid JWT for authenticated user
BENCHMARK_TEST_USER_1_JWT=eyJhbGc...  # JWT for test user 1
BENCHMARK_TEST_USER_2_JWT=eyJhbGc...  # JWT for test user 2

# Optional: Application base URL (default: http://localhost:5173)
BENCHMARK_BASE_URL=http://localhost:5173
```

**Security Notes:**
- Never commit `.env.benchmark` to Git (it's in `.gitignore`)
- Use dedicated test users for RLS isolation testing
- Rotate service role keys after benchmarking if exposed

## Corpus Curation

### Step 1: Select Papers

Follow guidelines in `benchmarks/corpus/README.md` to select 5-10 representative research papers covering:
- Various page counts (short, medium, long)
- Different layouts (single-column, double-column)
- Varying complexity (tables, formulas, citations)

### Step 2: Add Papers to Corpus

```bash
# Copy PDF files to corpus directory
cp /path/to/paper.pdf benchmarks/corpus/papers/paper-01-identifier.pdf

# Compute SHA256 hash
shasum -a 256 benchmarks/corpus/papers/paper-01-identifier.pdf
```

### Step 3: Update Metadata

Edit `benchmarks/corpus/metadata.json`:

```json
{
  "corpusVersion": "v1",
  "lastUpdated": "2025-01-01T00:00:00.000Z",
  "papers": [
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
  ]
}
```

## Gold Standard Annotation

### Tools

Recommended annotation tools:
- **BRAT** (brat.nlplab.org) - Web-based text annotation
- **Doccano** - Open source text annotation
- **Custom JSON editor** - For direct JSON editing

### Entity Annotation (`benchmarks/gold/entities.json`)

For each paper, annotate:
- **Concepts**: Key ideas, theories, frameworks
- **Methods**: Algorithms, techniques, approaches
- **Datasets**: Data resources used
- **Claims**: Assertions, findings, conclusions
- **Authors**: Paper authors
- **Metrics**: Evaluation metrics
- **Tasks**: NLP tasks, problem types

Each entity includes:
- Exact text span
- Normalized form (canonical name)
- Entity type
- Page number and character offsets

### Relation Annotation (`benchmarks/gold/relations.json`)

Annotate relationships between entities:
- `uses`: Method uses another method
- `extends`: Extends previous work
- `contradicts`: Contradicts a claim
- `cites`: References another work
- `evaluates_on`: Evaluated on a dataset
- `proposes`: Proposes a new concept
- `improves`: Improves upon something
- `based_on`: Based on prior work

### Evidence Span Annotation (`benchmarks/gold/evidence_spans.json`)

Link entities and relations to supporting text spans with:
- Page number
- Character offsets (start/end)
- Exact text

## Running Benchmarks

### Capture Baseline (BEFORE Phase 2)

**CRITICAL: Capture baseline BEFORE any schema changes.**

```bash
# Full baseline capture (all three benchmarks)
npm run benchmark:baseline

# Or run individually:
tsx benchmarks/scripts/run-extraction-benchmark.ts --phase baseline --output benchmarks/results/baseline.json
tsx benchmarks/scripts/run-db-benchmark.ts --phase baseline --output benchmarks/results/baseline.json
tsx benchmarks/scripts/run-graph-benchmark.ts --phase baseline --output benchmarks/results/baseline.json
```

### Run Per-Phase Benchmark

```bash
# Set phase name
export PHASE=phase-3

# Run all benchmarks for the phase
npm run benchmark:phase

# Or run individually:
tsx benchmarks/scripts/run-extraction-benchmark.ts --phase $PHASE --output benchmarks/results/$PHASE.json
tsx benchmarks/scripts/run-db-benchmark.ts --phase $PHASE --output benchmarks/results/$PHASE.json
tsx benchmarks/scripts/run-graph-benchmark.ts --phase $PHASE --output benchmarks/results/$PHASE.json
```

### Compare Results

```bash
# Compare phase against baseline
npm run benchmark:compare

# Or with custom paths:
tsx benchmarks/scripts/compare-results.ts \
  --before benchmarks/results/baseline.json \
  --after benchmarks/results/phase-3.json \
  --output benchmarks/results/comparison-phase-3.json
```

### Dry Run (Test Configuration)

```bash
# Verify scripts parse arguments correctly without execution
tsx benchmarks/scripts/run-extraction-benchmark.ts --dry-run --phase test --output test.json
tsx benchmarks/scripts/run-db-benchmark.ts --dry-run --phase test --output test.json
tsx benchmarks/scripts/run-graph-benchmark.ts --dry-run --phase test --output test.json
```

## Interpreting Results

### Output Format

Results are written to JSON files matching this schema:

```json
{
  "commit": "abc1234",
  "date": "2025-01-01T00:00:00.000Z",
  "phase": "baseline",
  "environment": "staging",
  "corpusVersion": "v1",
  "extraction": {
    "medianProcessingTimeMs": 250,
    "p95ProcessingTimeMs": 400,
    "parseSuccessRate": 0.98,
    "entityPrecision": 0.87,
    "entityRecall": 0.82,
    "relationF1": 0.78,
    "evidenceAccuracy": 0.85,
    "tokenCostPerPaperUsd": 0.002
  },
  "graph": {
    "initialLayoutTimeMs": 1200,
    "nodeClickLatencyMs": 50,
    "fullscreenTransitionMs": 100,
    "layoutOverlapPercent": 2.5,
    "dragFps": 58,
    "multiPaperQueryRenderMs": 3500
  },
  "database": {
    "paperGraphQueryP95Ms": 150,
    "indexHitRatio": 0.97,
    "orphanRecords": 0,
    "rlsIsolationTestsPassed": true
  }
}
```

### Comparison Output

The comparison script prints a table showing:
- Metric name
- Before value
- After value
- Absolute delta
- Percentage change
- Pass/fail status with reason

Exit codes:
- `0`: All metrics pass (no regressions)
- `1`: One or more metrics fail

### Targets

Targets are defined in `benchmarks/benchmark-targets.json`. Default targets:

| Metric | Target | Tolerance |
|--------|--------|-----------|
| Entity Precision | ≥0.85 | -0.05 |
| Entity Recall | ≥0.80 | -0.05 |
| Relation F1 | ≥0.75 | -0.05 |
| Parse Success Rate | ≥0.95 | -0.05 |
| Evidence Accuracy | ≥0.80 | -0.05 |
| Drag FPS | ≥55 | -5 |
| Index Hit Ratio | ≥0.95 | -0.05 |
| Orphan Records | ≤0 | 0 |
| RLS Isolation | PASS | 0 |

## Troubleshooting

### Authentication Errors

**Symptom:** `Missing required environment variables`

**Solution:**
1. Verify `.env.benchmark` exists in project root
2. Check all required variables are set
3. Ensure JWT tokens are valid and not expired
4. Regenerate tokens if needed via Supabase dashboard

### Timeout Errors

**Symptom:** Benchmark script times out during execution

**Solution:**
1. Increase timeout in script (search for `timeout:`)
2. Reduce corpus size for testing
3. Check network connectivity to Supabase
4. For graph benchmarks, ensure app is running at specified base URL

### Missing Gold Data

**Symptom:** `WARNING: Gold standard entities not found`

**Solution:**
1. Create gold annotation files following schemas in `benchmarks/gold/`
2. Validate JSON against schemas using a JSON validator
3. Ensure `paperId` values match between corpus metadata and annotations

### Playwright Browser Issues

**Symptom:** `Browser executable not found`

**Solution:**
```bash
# Reinstall Playwright browsers
npx playwright install chromium --force

# Or use system browser
PLAYWRIGHT_BROWSERS_PATH=0 tsx benchmarks/scripts/run-graph-benchmark.ts ...
```

### Database Connection Errors

**Symptom:** Failed to connect to Supabase

**Solution:**
1. Verify `VITE_SUPABASE_URL` is correct
2. Check `SUPABASE_SERVICE_ROLE_KEY` is valid
3. Ensure staging environment is accessible
4. Check firewall/network rules

### Empty Corpus Warning

**Symptom:** `WARNING: Corpus is empty`

**Solution:**
1. Add PDF files to `benchmarks/corpus/papers/`
2. Update `benchmarks/corpus/metadata.json` with paper entries
3. Verify filenames match between directory and metadata

## Best Practices

1. **Always capture baseline first** - Before any code changes
2. **Use consistent corpus** - Don't change papers between phases
3. **Run multiple times** - Average results for noisy metrics
4. **Document anomalies** - Note any unusual conditions during runs
5. **Keep gold standards updated** - As extraction improves, revalidate annotations
6. **Never benchmark production** - Always use staging environment
7. **Clean up test data** - Remove benchmark-generated records after tests

## File Structure

```
benchmarks/
├── corpus/
│   ├── README.md              # Corpus curation guidelines
│   ├── metadata.json          # Paper metadata
│   └── papers/                # PDF files (not in Git)
├── gold/
│   ├── entities.json          # Ground truth entities
│   ├── relations.json         # Ground truth relations
│   └── evidence_spans.json    # Ground truth evidence
├── scripts/
│   ├── run-extraction-benchmark.ts
│   ├── run-db-benchmark.ts
│   ├── run-graph-benchmark.ts
│   ├── compare-results.ts
│   └── utils/
│       ├── supabase-client.ts
│       ├── metrics-collector.ts
│       └── validators.ts
├── results/
│   ├── baseline.json          # Baseline results
│   └── phase-N.json           # Phase-specific results
├── docs/
│   └── benchmarking-guide.md  # This file
├── benchmark-targets.json     # Target configuration
└── .gitkeep
```

## Adding New Metrics

To add a new metric:

1. Add to `BenchmarkResult` interface in all scripts
2. Add target to `benchmark-targets.json`
3. Add to comparison metric list in `compare-results.ts`
4. Update this documentation

## Support

For issues or questions:
1. Check this guide first
2. Review script source code for inline documentation
3. Check Phase 1 System State Document for context
