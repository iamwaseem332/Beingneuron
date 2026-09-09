# Phase 5: Cost Governance Specification

## Overview

Three-tier cost governance prevents budget overruns at job, user, and system levels.

## Tier 1: Job-Level Budget

### Hard Cap

- **Limit**: $2.00 per job
- **Enforcement**: Pre-chunk processing check
- **Action on Exceed**: Halt job, move to DLQ with `cost_exceeded` error

### Soft Warning

- **Threshold**: 80% of budget ($1.60)
- **Action**: Log warning, continue processing

### Cost Calculation

```typescript
estimatedCost = (inputTokens * inputRate) + (outputTokens * outputRate);
// Example: GPT-4o-mini: $0.15/1M input, $0.60/1M output
```

## Tier 2: User-Level Quota

### Integration

Integrates with Phase 2 billing schema via `user_usage` table.

### Quota Tiers

| Plan | Monthly Limit | Overage Behavior |
|------|---------------|------------------|
| Free | $10 | Block new jobs |
| Pro | $50 | Block new jobs |
| Enterprise | Custom | Alert only |

### Warning Threshold

- **Level**: 90% of monthly quota
- **Action**: Include warning in job progress response

## Tier 3: System-Level Alerts

### Monitoring

Hourly pg_cron job aggregates spend across all jobs.

### Alert Thresholds

| Threshold | Severity | Action |
|-----------|----------|--------|
| $50/day | Warning | Email to ops |
| $200/day | Critical | Slack + email |
| >3σ anomaly | Investigation | Auto-generated report |

### Anomaly Detection

```
threshold = rolling_avg_7d + (3 * stddev_7d)
alert_if daily_spend > threshold
```

## Pricing Table

Stored in `llm_pricing` config table for runtime updates:

```sql
CREATE TABLE llm_pricing (
  provider TEXT PRIMARY KEY,
  model TEXT PRIMARY KEY,
  input_rate_per_million NUMERIC(10,6),
  output_rate_per_million NUMERIC(10,6),
  effective_date DATE,
  version INT
);
```

## Token Accounting

Every extraction result includes:

```typescript
{
  tokenUsage: {
    input: number,
    output: number
  }
}
```

Aggregated to job-level `token_usage_input` and `token_usage_output` columns.

## Reconciliation

Weekly job compares logged usage vs. provider bills:

```sql
SELECT 
  SUM(token_usage_input) as total_input,
  SUM(token_usage_output) as total_output,
  SUM(estimated_cost_usd) as total_cost
FROM extraction_jobs
WHERE created_at BETWEEN $start AND $end;
```
