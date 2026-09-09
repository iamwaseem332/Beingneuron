# Scientific Evaluation Specification

## Overview

This document specifies the continuous scientific evaluation pipeline that ensures ongoing validity of extraction, normalization, and synthesis operations against gold standard corpora.

## Evaluation Dataset

### Composition

| Dataset Type | Count | Update Frequency |
|-------------|-------|------------------|
| Single-Paper Gold Standard | 5 papers | Quarterly |
| Multi-Paper Synthesis Sets | 2 sets (3-5 papers each) | Quarterly |
| Edge Cases | 20 examples | Monthly |
| Adversarial Examples | 10 examples | Monthly |

### Storage & Versioning

- Location: Private S3 bucket `beingneuron-gold-corpus`
- Versioning: Git LFS with semantic versioning (v1.0.0, v1.1.0, etc.)
- Schema Validation: JSON Schema on ingestion
- Access Control: Service role only; audit logging enabled

### Annotation Protocol

All gold standard annotations follow Phase 3 annotation protocol:
- Entity spans with char offsets
- Relation types with explicit/co-occurrence flags
- Evidence span verification
- Canonical entity mappings
- Conflict labels

## Automated Metrics Computation

### Nightly Job Schedule

```sql
-- pg_cron job runs at 2 AM UTC daily
SELECT cron.schedule(
  'nightly-evaluation',
  '0 2 * * *',
  $$SELECT pgrunnightly_evaluation()$$
);
```

### Metrics Computed

#### Entity Extraction Metrics

```typescript
interface EntityMetrics {
  precision: number;    // TP / (TP + FP)
  recall: number;       // TP / (TP + FN)
  f1: number;           // Harmonic mean
  typeAccuracy: number; // % correct type assignment
}

// Targets (from Phase 4)
const ENTITY_TARGETS = {
  precision: 0.85,
  recall: 0.80,
  f1: 0.82,
  typeAccuracy: 0.90
};
```

#### Relation Extraction Metrics

```typescript
interface RelationMetrics {
  semanticPrecision: number; // Explicit relations only
  recall: number;
  cooccurrenceAccuracy: number; // isExplicitlyStated: false accuracy
  evidenceSupportRate: number;  // Manual verification of 50 samples
}

// Targets (from Phase 4)
const RELATION_TARGETS = {
  semanticPrecision: 0.75,
  recall: 0.70,
  cooccurrenceAccuracy: 0.90,
  evidenceSupportRate: 0.85
};
```

#### Evidence Grounding Metrics

```typescript
interface EvidenceMetrics {
  spanAccuracy: number;        // Exact char offset match
  provenanceIntegrity: number; // Zero fabricated chunks/pages
  excerptVerifiability: number; // Verbatim in source chunk
}

// Targets (from Phase 7)
const EVIDENCE_TARGETS = {
  spanAccuracy: 0.95,
  provenanceIntegrity: 1.00,
  excerptVerifiability: 0.98
};
```

#### Normalization Metrics

```typescript
interface NormalizationMetrics {
  recall: number;         // Gold entities recovered
  falseMergeRate: number; // Distinct concepts incorrectly merged
  curationEfficiency: number; // Auto-entries not requiring correction
}

// Targets (from Phase 8)
const NORMALIZATION_TARGETS = {
  recall: 0.85,
  falseMergeRate: 0.05,
  curationEfficiency: 0.80
};
```

#### Conflict Detection Metrics

```typescript
interface ConflictMetrics {
  detectionRecall: number;      // Gold contradictions surfaced
  falsePositiveRate: number;    // Flagged conflicts that aren't real
  weightCorrelation: number;    // Spearman ρ vs human judgments
  temporalAccuracy: number;     // Evolution chains correctly sequenced
}

// Targets (from Phase 8)
const CONFLICT_TARGETS = {
  detectionRecall: 0.85,
  falsePositiveRate: 0.10,
  weightCorrelation: 0.75,
  temporalAccuracy: 0.90
};
```

## Alert Thresholds

### Statistical Process Control

Alerts triggered based on deviation from 7-day rolling average:

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Entity F1 | >5% regression | >10% regression |
| Relation Precision | >5% regression | >10% regression |
| Evidence Accuracy | >5% regression | >10% regression |
| Normalization Recall | >5% regression | >10% regression |
| Conflict Detection | >10% regression | >20% regression |

### Alert Routing

```typescript
enum AlertSeverity {
  INFO = 'info',         // Log only
  WARNING = 'warning',   // Slack notification
  CRITICAL = 'critical'  // PagerDuty + Slack + Email
}

const ALERT_ROUTING = {
  [AlertSeverity.INFO]: ['logs'],
  [AlertSeverity.WARNING]: ['slack:test-alerts'],
  [AlertSeverity.CRITICAL]: ['pagerduty:oncall', 'slack:test-critical', 'email:team']
};
```

## Human Evaluation Cadence

### Monthly Review Process

1. **Sample Selection**: 20 random extractions from past month
   - Stratified by entity type, paper domain, extraction date
   - Include edge cases and low-confidence items

2. **Reviewer Assignment**: 2 independent domain experts
   - Blind to system confidence scores
   - Trained on annotation protocol

3. **Scoring Rubric**:
   ```typescript
   interface HumanScore {
     correctness: number;      // 1-5 Likert scale
     usefulness: number;       // 1-5 Likert scale
     evidenceQuality: number;  // 1-5 Likert scale
     comments: string;
   }
   ```

4. **Inter-Rater Reliability**:
   - Compute Cohen's κ for categorical judgments
   - Target: κ ≥ 0.75
   - Disagreements resolved by senior adjudicator

5. **Feedback Loop**:
   - Results added to prompt/model tuning backlog
   - Systematic errors trigger targeted retraining
   - Rubric updates incorporated quarterly

## Drift Detection

### Monitored Signals

| Signal | Detection Method | Response |
|--------|------------------|----------|
| Token usage distribution | KS test vs baseline | Investigate prompt changes |
| Entity type frequency | Chi-square test | Check for schema drift |
| Latency percentiles | Control charts | Provider degradation |
| Cost per paper | Trend analysis | Budget adjustment |
| Confidence score distribution | Histogram comparison | Model behavior shift |

### Anomaly Detection Algorithm

```typescript
function detectAnomaly(
  currentWindow: number[],
  baselineWindow: number[],
  sensitivity: number = 3
): boolean {
  const baselineMean = mean(baselineWindow);
  const baselineStd = std(baselineWindow);
  const currentMean = mean(currentWindow);
  
  const zScore = Math.abs(currentMean - baselineMean) / baselineStd;
  return zScore > sensitivity; // 3σ threshold
}
```

## Model/Prompt Versioning

### Logging Schema

Every extraction/synthesis call logs:

```typescript
interface ExtractionMetadata {
  model: string;           // e.g., "gpt-4-0613"
  promptVersion: string;   // e.g., "v2.3.1"
  temperature: number;
  timestamp: string;
  gitCommitHash: string;
  configHash: string;
}
```

### A/B Testing Framework

```typescript
interface ABTestConfig {
  name: string;
  variants: Array<{
    id: string;
    model: string;
    promptVersion: string;
    trafficPercent: number;
  }>;
  successMetric: keyof EvaluationMetrics;
  minSampleSize: number;
  significanceLevel: number;
}

// Example: Test new prompt version
const PROMPT_AB_TEST: ABTestConfig = {
  name: 'prompt-v2.4-evaluation',
  variants: [
    { id: 'control', model: 'gpt-4-0613', promptVersion: 'v2.3.1', trafficPercent: 50 },
    { id: 'treatment', model: 'gpt-4-0613', promptVersion: 'v2.4.0', trafficPercent: 50 }
  ],
  successMetric: 'entityF1',
  minSampleSize: 100,
  significanceLevel: 0.05
};
```

### Rollback Procedure

1. Detect regression via alert
2. Identify offending version from metadata
3. Update config to route traffic to previous version
4. No code deploy required (configuration change only)
5. Post-mortem analysis within 48 hours

## Results Storage & Visualization

### Database Schema

```sql
CREATE TABLE evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at TIMESTAMPTZ NOT NULL,
  git_commit_hash TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  metrics JSONB NOT NULL,
  alerts_triggered JSONB[] DEFAULT '{}'
);

CREATE INDEX idx_evaluation_results_computed_at 
  ON evaluation_results(computed_at DESC);
```

### Admin Dashboard

Accessible at `/admin/evaluation`:
- Time-series charts for all metrics
- Alert history with resolution status
- A/B test results with statistical significance
- Human evaluation scores and inter-rater reliability
- Model/prompt version comparison

## Maintenance Guide

### Updating Gold Corpus

1. New papers annotated per Phase 3 protocol
2. Inter-rater reliability computed (κ ≥ 0.75 required)
3. JSON Schema validation
4. Version bump and S3 upload
5. Invalidate cached evaluation results

### Tuning Alert Thresholds

1. Analyze historical alert data
2. Compute false positive/negative rates
3. Adjust thresholds to balance sensitivity/specificity
4. Document rationale in changelog
5. Deploy via configuration update

### Troubleshooting

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Metrics suddenly drop | Gold corpus corruption | Validate JSON Schema; restore from backup |
| Alerts firing constantly | Threshold too sensitive | Increase threshold; check baseline window |
| No alerts despite regression | Detection lag | Reduce window size; lower σ threshold |
| Human scores diverge | Rater drift | Retrain reviewers; update rubric |
