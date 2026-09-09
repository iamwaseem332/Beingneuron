# Production Hardening Specification

## Overview

This document specifies the production hardening measures implemented in Phase 10 to ensure BeingNeuron Synapse operates reliably, securely, and observably in production environments.

## 1. Observability Stack

### 1.1 Structured Logging

**Implementation**: `src/lib/observability/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'beingneuron-synapse',
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
});

// Standard log fields for all entries
interface LogContext {
  request_id: string;
  user_id?: string;
  paper_id?: string;
  phase: 'parsing' | 'extraction' | 'synthesis' | 'rendering';
  duration_ms?: number;
  error?: Error;
}
```

**Log Shipping**:
- Edge Functions → Supabase Logs (real-time)
- Supabase Logs → Better Stack / Datadog (aggregation)
- Retention: 30 days hot storage, 90 days archived

### 1.2 Metrics Collection

**Implementation**: `src/lib/observability/metrics.ts`

Custom counters and histograms exported to Prometheus-compatible endpoint (`/metrics`):

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `extraction_jobs_total` | Counter | `status`, `provider` | Total extraction jobs processed |
| `extraction_job_duration_seconds` | Histogram | `paper_size_bucket` | Time to complete extraction |
| `cache_hits_total` | Counter | `tier`, `resource_type` | Cache hit events |
| `evidence_sync_events_total` | Counter | `direction`, `success` | Bidirectional sync attempts |
| `conflicts_surfaced_total` | Counter | `conflict_type` | Conflicts detected in synthesis |
| `llm_tokens_used_total` | Counter | `model`, `type` (input/output) | Token consumption |

**Alert Thresholds**:
- Extraction job failure rate > 5% over 15min
- Cache hit rate < 70% over 1hr
- Evidence sync latency p95 > 500ms
- Token spend rate > $10/hr

### 1.3 Distributed Tracing

**Implementation**: OpenTelemetry instrumentation in `src/lib/observability/tracing.ts`

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const provider = new NodeTracerProvider();
const exporter = new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_URL });

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();
```

**Trace Propagation**:
- Frontend: W3C Trace Context headers
- Edge Functions: Extract/propagate traceparent
- Database: Query tagging with trace ID

**Dashboards**:
- Request flow: Frontend → Edge Function → DB → LLM Provider
- Latency breakdown by span
- Error correlation across services

## 2. Security Hardening

### 2.1 Dependency Scanning

**CI Integration** (`.github/workflows/security.yml`):

```yaml
- name: Run npm audit
  run: npm audit --audit-level=high
  
- name: Run Snyk
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high
```

**Policy**:
- Block merges on Critical/High vulnerabilities
- Medium vulnerabilities: create ticket, fix within 14 days
- Low vulnerabilities: batched monthly cleanup

### 2.2 Secret Rotation

**Automated Rotation Schedule**:

| Secret | Rotation Frequency | Method |
|--------|-------------------|--------|
| OpenAI API Key | 30 days | Dual-key grace period (48hr overlap) |
| Anthropic API Key | 30 days | Dual-key grace period |
| Supabase Service Role | 90 days | Manual + automated reminder |
| JWT Signing Key | 180 days | Coordinated deploy |

**Implementation**: `supabase/functions/rotate-secrets/index.ts`

```typescript
// Dual-key rotation pattern
async function rotateApiKey(secretName: string): Promise<void> {
  const newKey = await generateNewKey();
  await supabase.from('secrets').insert({ 
    name: `${secretName}_new`, 
    value: encrypt(newKey) 
  });
  
  // 48-hour grace period with both keys valid
  await sleep(48 * 60 * 60 * 1000);
  
  // Deprecate old key
  await supabase.from('secrets').update({ 
    status: 'deprecated' 
  }).eq('name', secretName);
}
```

### 2.3 Penetration Testing

**Quarterly Assessment Scope**:
- RLS policy bypass attempts
- IDOR (Insecure Direct Object Reference) testing
- SQL injection vectors
- XSS via evidence excerpts
- CSRF on state-changing operations

**Remediation SLA**:
| Severity | Response Time | Resolution Time |
|----------|--------------|-----------------|
| Critical | 4 hours | 24 hours |
| High | 24 hours | 7 days |
| Medium | 7 days | 30 days |
| Low | 30 days | 90 days |

### 2.4 Content Security Policy

**Headers** (applied in `vite.config.js`):

```javascript
{
  'Content-Security-Policy': `
    default-src 'self';
    script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://*.supabase.co;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' https://*.supabase.co https://api.openai.com https://api.anthropic.com;
    worker-src 'self' blob:;
  `,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}
```

**Deployment Strategy**:
1. Week 1-2: `Content-Security-Policy-Report-Only` mode
2. Analyze violation reports
3. Week 3: Enforce with strict policy

## 3. Disaster Recovery

### 3.1 Backup Strategy

**Automated Backups**:

```sql
-- Daily pg_dump via pg_cron
SELECT cron.schedule(
  'daily-backup',
  '0 2 * * *',
  $$SELECT net.http_post(
    url:='https://backup-service.internal/trigger',
    body:='{"type": "full"}'::jsonb
  )$$
);
```

**WAL Archiving**:
- Continuous archiving to encrypted S3 bucket
- Retention: 7 days point-in-time recovery
- Encryption: AES-256 with KMS-managed keys

**Backup Verification**:
- Weekly automated restore test to isolated environment
- Monthly manual verification by ops team

### 3.2 Failover Procedures

**Read Replica Promotion Runbook**:

1. **Detection**: Primary DB health check fails (3 consecutive failures)
2. **Alert**: PagerDuty incident created
3. **Decision**: On-call engineer confirms failover necessity
4. **Execution**:
   ```bash
   # Promote replica
   supabase db promote --replica-id <replica-id>
   
   # Update connection strings
   kubectl set env deployment/synapse-api \
     DATABASE_URL=$NEW_PRIMARY_URL
   ```
5. **Validation**: Run smoke tests against new primary
6. **Communication**: Status page update, stakeholder notification

**RTO/RPO Targets**:
- Recovery Time Objective (RTO): < 15 minutes
- Recovery Point Objective (RPO): < 5 minutes

### 3.3 Data Retention Policies

**Automated Cleanup Jobs**:

```sql
-- Delete orphaned storage objects older than 30 days
SELECT cron.schedule(
  'cleanup-orphaned-storage',
  '0 3 * * 0',
  $$DELETE FROM storage.objects 
   WHERE owner NOT IN (SELECT id FROM auth.users)
   AND created_at < NOW() - INTERVAL '30 days'$$
);

-- Archive DLQ items older than 30 days
SELECT cron.schedule(
  'archive-dlq',
  '0 4 * * 0',
  $$INSERT INTO extraction_jobs_archive
   SELECT * FROM extraction_jobs 
   WHERE status = 'dead_letter' 
   AND updated_at < NOW() - INTERVAL '30 days';
   
   DELETE FROM extraction_jobs 
   WHERE status = 'dead_letter' 
   AND updated_at < NOW() - INTERVAL '30 days'$$
);

-- Expire cache entries based on TTL
SELECT cron.schedule(
  'expire-cache',
  '0 */6 * * *',
  $$DELETE FROM cache_entries 
   WHERE expires_at < NOW()$$
);
```

## 4. Incident Response

### 4.1 Alert Routing Matrix

| Alert Type | Severity | Channel | Escalation Path |
|------------|----------|---------|-----------------|
| DLQ depth > 10 | Critical | PagerDuty | On-call → Engineering Lead → CTO |
| RLS leak detected | Critical | PagerDuty + Slack | Security Team → CTO |
| Evaluation regression > 10% | High | Slack | Research Lead → Engineering Lead |
| Cache stampede | High | Slack | On-call |
| Provider outage | High | Slack | On-call → Vendor support |
| Quota exhaustion | Warning | Slack | On-call |
| Elevated error rate (>2σ) | Warning | Slack | Monitored |

### 4.2 Runbooks

**Cache Stampede Mitigation**:

```markdown
## Symptoms
- Spike in database CPU
- Increased latency on graph load endpoints
- Cache hit rate drops below 50%

## Immediate Actions
1. Enable request coalescing: `CACHE_REQUEST_COALESCE=true`
2. Increase stale-while-revalidate window: 60s → 300s
3. Scale Edge Function replicas: 3 → 10

## Root Cause Analysis
1. Check cache invalidation patterns
2. Review recent deployments for cache key changes
3. Analyze traffic patterns for unusual spikes

## Prevention
- Implement circuit breaker on cache misses
- Add jitter to cache expiration times
- Pre-warm cache for high-traffic papers
```

**Provider Outage Response**:

```markdown
## Symptoms
- LLM API returning 5xx errors
- Extraction jobs stuck in 'processing' state
- Fallback provider activation alerts

## Immediate Actions
1. Confirm outage via provider status page
2. Activate fallback RegexProvider for all extractions
3. Pause non-critical extraction jobs
4. Notify users via status page

## Recovery
1. Monitor provider status for resolution
2. Gradually resume normal extraction (10% → 50% → 100%)
3. Re-process failed jobs from DLQ

## Post-Incident
- Document timeline and impact
- Evaluate multi-provider redundancy strategy
- Update runbook with lessons learned
```

### 4.3 On-Call Rotation

**Schedule**:
- Weekly rotation (Monday 9am → Monday 9am)
- Primary + Secondary on-call per week
- Handoff meeting every Monday 10am

**Responsibilities**:
- Monitor alerts and respond within SLA
- Triage incidents and escalate as needed
- Perform emergency deploys if required
- Document incidents in post-mortem template

**Compensation**:
- Base on-call stipend: $500/week
- Incident response: $200/incident (outside business hours)
- Post-mortem authorship: $100/report

## 5. SLO Definitions

### 5.1 Availability SLOs

| Service | Target | Measurement Window |
|---------|--------|-------------------|
| API Endpoints | 99.9% | Monthly |
| Graph Rendering | 99.5% | Monthly |
| Evidence Sync | 99.0% | Weekly |
| Multi-Paper Synthesis | 98.0% | Weekly |

**Calculation**:
```
Availability = (Total Minutes - Downtime Minutes) / Total Minutes × 100
Downtime = Any 5-minute window with >5% error rate
```

### 5.2 Latency SLOs

| Endpoint | p50 Target | p95 Target | p99 Target |
|----------|-----------|-----------|-----------|
| GET /api/papers/:id/graph | 200ms | 500ms | 1000ms |
| POST /api/extraction/jobs | 500ms | 1500ms | 3000ms |
| GET /api/synthesis/merge | 1000ms | 3000ms | 5000ms |
| Evidence highlight render | 100ms | 200ms | 400ms |

### 5.3 Correctness SLOs

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Evidence Span Accuracy | ≥99% | Automated validation vs gold standard |
| Merge Correctness | 100% | Cached vs fresh comparison |
| Layout Determinism | 0px deviation | Hash-based position verification |
| Sync Integrity | 0 feedback loops | Stress test monitoring |

## 6. Monitoring Setup

### 6.1 Dashboard Configuration

**Primary Operations Dashboard** (Grafana):

1. **System Health Panel**
   - Request rate (req/min)
   - Error rate (%)
   - p95 latency (ms)
   - Active connections

2. **Extraction Pipeline Panel**
   - Jobs by status (pending/processing/completed/failed/DLQ)
   - Average extraction time
   - Token usage trends
   - Provider success rate

3. **Cache Performance Panel**
   - Hit rate by tier (L1/L2/L3)
   - Eviction rate
   - Memory utilization
   - Staleness incidents

4. **User Experience Panel**
   - Core Web Vitals (LCP/FID/CLS)
   - Graph render time
   - Evidence sync latency
   - Support ticket volume

### 6.2 Alert Configuration

**PagerDuty Integration**:

```yaml
# config/alerts.yml
alerts:
  - name: HighErrorRate
    condition: error_rate > 0.05 for 5m
    severity: critical
    escalation_policy: engineering-oncall
    
  - name: DLQAccumulation
    condition: dlq_depth > 10
    severity: critical
    escalation_policy: engineering-oncall
    
  - name: CacheHitRateLow
    condition: cache_hit_rate < 0.7 for 1h
    severity: warning
    escalation_policy: engineering-slack
    
  - name: ScientificDrift
    condition: entity_f1_regression > 0.05
    severity: high
    escalation_policy: research-team
```

## 7. Compliance & Audit

### 7.1 Audit Logging

**Logged Events**:
- User authentication (success/failure)
- Data access (paper views, exports)
- Administrative actions (user management, config changes)
- Security events (RLS violations, rate limit breaches)

**Retention**: 1 year minimum (regulatory requirement)

### 7.2 Access Reviews

**Quarterly Reviews**:
- Service role permissions
- Third-party integration scopes
- Admin user access levels
- API key usage patterns

## 8. Maintenance Windows

**Scheduled Maintenance**:
- Sunday 2:00-4:00 AM UTC (low-traffic window)
- Advance notice: 72 hours via status page
- Maximum duration: 2 hours
- Rollback plan required for all maintenance activities

**Maintenance Types**:
| Type | Frequency | Downtime Required |
|------|-----------|-------------------|
| Database migrations | Monthly | Zero-downtime (online migrations) |
| Security patches | As needed | < 5 minutes (rolling deploy) |
| Major version upgrades | Quarterly | < 30 minutes (blue-green) |
| Infrastructure scaling | As needed | Zero-downtime |

## 9. Related Documents

- [E2E Test Suite Specification](./e2e-test-suite-spec.md)
- [Scientific Evaluation Specification](./scientific-evaluation-spec.md)
- [Operations Runbook](./operations-runbook.md)
- [Release Certification Checklist](./release-certification.md)
- [Post-Mortem Template](./postmortem-template.md)

## 10. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-10 | Engineering Team | Initial production hardening spec |
| 1.1 | 2026-09-12 | Security Team | Added CSP headers and pen test schedule |
| 1.2 | 2026-09-14 | Ops Team | Added DR runbooks and alert matrix |
