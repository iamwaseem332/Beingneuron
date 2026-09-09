# Operations Runbook

## Purpose

This runbook provides step-by-step procedures for common operational tasks, incident response, and maintenance activities for the BeingNeuron Synapse platform.

## Table of Contents

1. [Daily Operations](#1-daily-operations)
2. [Incident Response](#2-incident-response)
3. [Scaling Procedures](#3-scaling-procedures)
4. [Maintenance Windows](#4-maintenance-windows)
5. [Emergency Contacts](#5-emergency-contacts)

---

## 1. Daily Operations

### 1.1 Morning Health Check (9:00 AM UTC)

**Checklist**:

```markdown
- [ ] Review overnight alerts in PagerDuty/Slack
- [ ] Check system dashboard for anomalies:
  - Error rate < 1%
  - p95 latency within SLO
  - Cache hit rate > 80%
  - DLQ depth = 0
- [ ] Verify backup completion (check S3 bucket for today's dump)
- [ ] Review scientific evaluation metrics (no >5% regression)
- [ ] Scan support ticket queue for urgent issues
- [ ] Check token spend vs daily budget ($50/day warning threshold)
```

**Dashboard URLs**:
- Grafana Operations: `https://grafana.internal/d/synapse-ops`
- Scientific Evaluation: `https://admin.beingneuron.com/evaluation`
- Support Tickets: `https://support.beingneuron.com/tickets`

### 1.2 End-of-Day Report (5:00 PM UTC)

**Automated Report Generation**:

```bash
# Run daily summary script
npm run ops:daily-report -- --date=$(date +%Y-%m-%d)

# Output includes:
# - Total extraction jobs processed
# - Average extraction time
# - Token consumption and cost
# - Cache performance metrics
# - Any incidents or alerts
# - Support ticket summary
```

**Distribution**:
- Email to engineering@beingneuron.com
- Slack #ops-daily channel
- Attached to weekly stakeholder report

### 1.3 Weekly Ops Review (Monday 10:00 AM UTC)

**Attendees**: On-call engineer (outgoing), On-call engineer (incoming), Engineering Lead

**Agenda**:
1. Review incidents from previous week (15 min)
2. Discuss pending maintenance tasks (10 min)
3. Handoff open action items (10 min)
4. Review upcoming deployments (10 min)
5. Q&A (15 min)

**Preparation**:
- Outgoing on-call prepares incident summary
- Update operations dashboard with any manual fixes
- Ensure all runbooks are up-to-date

---

## 2. Incident Response

### 2.1 Severity Classification

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| P0 - Critical | Complete service outage, data loss, security breach | Immediate (< 15 min) | DB down, RLS bypass, mass extraction failures |
| P1 - High | Major feature broken, significant degradation | < 1 hour | Graph rendering fails, evidence sync broken |
| P2 - Medium | Minor feature impaired, workaround exists | < 4 hours | Slow merge performance, occasional cache misses |
| P3 - Low | Cosmetic issue, minor inconvenience | Next business day | Label truncation, non-critical UI bugs |

### 2.2 Incident Response Workflow

**Step 1: Detection & Triage**

```markdown
1. Alert received via PagerDuty/Slack
2. Acknowledge alert within SLA
3. Classify severity using matrix above
4. Create incident channel: #incident-YYYY-MM-DD-brief-description
5. Notify stakeholders based on severity:
   - P0: Page entire engineering team + CTO
   - P1: Page on-call + Engineering Lead
   - P2: Post to #engineering Slack
   - P3: Create GitHub issue
```

**Step 2: Investigation**

```markdown
1. Gather initial data:
   - When did it start?
   - What's the blast radius (% users affected)?
   - Any recent deploys or config changes?
   
2. Check relevant dashboards:
   - System health metrics
   - Error logs (filter by error type)
   - Distributed traces for failing requests
   
3. Form hypothesis about root cause
4. Document findings in incident channel
```

**Step 3: Mitigation**

```markdown
1. Implement immediate fix or workaround:
   - Rollback recent deploy if suspected
   - Scale up resources if load-related
   - Enable feature flag to disable broken feature
   - Activate fallback provider (for LLM issues)
   
2. Verify mitigation effectiveness:
   - Monitor error rate for 15 minutes
   - Confirm user-facing functionality restored
   - Check downstream systems unaffected
   
3. Communicate status:
   - Update status page
   - Post update in incident channel
   - Notify affected users if appropriate
```

**Step 4: Resolution**

```markdown
1. Confirm full resolution:
   - All metrics back to normal for 30+ minutes
   - No recurring errors in logs
   - User reports resolved
   
2. Close incident:
   - Update status page to "Resolved"
   - Post final summary in incident channel
   - Notify stakeholders
   
3. Schedule post-mortem (for P0/P1 incidents):
   - Within 48 hours of resolution
   - Assign author and attendees
   - Schedule 60-minute meeting
```

### 2.3 Common Incident Playbooks

#### Playbook A: Database Connection Exhaustion

**Symptoms**:
- Error: `too many clients already`
- Spike in connection wait time
- Extraction jobs stuck in 'pending'

**Immediate Actions**:
```bash
# 1. Check current connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# 2. Identify long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
         FROM pg_stat_activity 
         WHERE state = 'active' 
         ORDER BY duration DESC 
         LIMIT 10;"

# 3. Kill runaway queries (if safe)
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
         WHERE query LIKE '%long_running_query%' AND pid <> pg_backend_pid();"

# 4. Scale Edge Function replicas to reduce connection pressure
kubectl scale deployment synapse-edge --replicas=3
```

**Root Cause Analysis**:
- Check for missing database indexes
- Review connection pool settings
- Identify N+1 query patterns in recent code

**Prevention**:
- Implement connection pooling (pgbouncer)
- Add query timeout limits
- Set up alerting on connection count > 80% max

#### Playbook B: LLM Provider Outage

**Symptoms**:
- 5xx errors from OpenAI/Anthropic API
- Extraction jobs failing with `provider_error`
- Fallback provider activation alerts

**Immediate Actions**:
```bash
# 1. Confirm outage via status page
curl https://status.openai.com/api/v2/status.json
curl https://status.anthropic.com/api/v2/status.json

# 2. Force all traffic to fallback provider
export EXTRACTION_PROVIDER=regex_fallback

# 3. Pause non-urgent extraction jobs
psql -c "UPDATE extraction_jobs SET status='paused' WHERE status='pending';"

# 4. Post to status page
curl -X POST https://statuspage.io/api/incidents \
  -d "incident[name]=LLM Provider Degradation" \
  -d "incident[status]=investigating"
```

**Recovery**:
```bash
# 1. Monitor provider status for resolution
watch curl https://status.openai.com/api/v2/status.json

# 2. Gradually resume normal operations
psql -c "UPDATE extraction_jobs SET status='pending' WHERE status='paused' LIMIT 10;"

# 3. Increase batch size over 30 minutes
# Batch 1: 10 jobs → verify success
# Batch 2: 25 jobs → verify success
# Batch 3: 50 jobs → full capacity

# 4. Re-process failed jobs from DLQ
npm run jobs:retry -- --status=failed --limit=50
```

#### Playbook C: Cache Stampede

**Symptoms**:
- Cache hit rate drops from 90% → 40%
- Database CPU spikes to 95%+
- Latency p95 increases 3x

**Immediate Actions**:
```bash
# 1. Enable request coalescing
export CACHE_REQUEST_COALESCE=true

# 2. Increase stale-while-revalidate window
# Edit Edge Function config: cache-control: s-maxage=300, stale-while-revalidate=300

# 3. Pre-warm cache for high-traffic papers
npm run cache:warm -- --papers=top-100-paper-ids.json

# 4. Scale database read replicas
supabase db replica create --size=large
```

**Post-Incident**:
- Implement circuit breaker on cache misses
- Add jitter to cache TTLs (prevent thundering herd)
- Review cache invalidation logic for over-aggressive purging

---

## 3. Scaling Procedures

### 3.1 Horizontal Scaling (Edge Functions)

**When to Scale**:
- Request queue depth > 100
- Average response time > 2x baseline
- CPU utilization > 70% sustained

**Manual Scaling**:
```bash
# Scale Edge Function replicas
kubectl scale deployment synapse-edge --replicas=10

# Verify scaling
kubectl get pods -l app=synapse-edge

# Monitor rollout
kubectl rollout status deployment/synapse-edge
```

**Auto-Scaling Configuration** (HPA):
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: synapse-edge-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: synapse-edge
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### 3.2 Vertical Scaling (Database)

**When to Scale**:
- Connection count > 80% of max
- Query latency p95 > 500ms
- Storage utilization > 75%

**Scaling Steps**:
```bash
# 1. Check current instance size
supabase db info

# 2. Schedule maintenance window (Sunday 2-4 AM UTC)
# 3. Initiate upgrade
supabase db upgrade --size=large

# 4. Monitor progress (typically 10-15 minutes)
watch supabase db status

# 5. Run smoke tests post-upgrade
npm run test:smoke -- --env=production

# 6. Update monitoring thresholds for new instance size
```

### 3.3 Cache Layer Scaling

**Redis Cluster Expansion**:
```bash
# Add new shard to existing cluster
redis-cli CLUSTER ADD-SLOTS $(seq 8192 16383)

# Rebalance slots across nodes
redis-cli --cluster rebalance $NEW_NODE_IP:6379

# Verify cluster health
redis-cli --cluster check $CLUSTER_ENDPOINT:6379
```

**Cache Warming Strategy**:
```typescript
// scripts/cache-warm.ts
const topPapers = await getTopAccessedPapers({ limit: 100, period: '7d' });

for (const paper of topPapers) {
  // Pre-fetch graph layout
  await fetch(`/api/papers/${paper.id}/graph`, { 
    headers: { 'Cache-Warm': 'true' } 
  });
  
  // Pre-fetch merged synthesis if applicable
  if (paper.isMultiPaper) {
    await fetch(`/api/synthesis/merge?papers=${paper.paperIds}`, {
      headers: { 'Cache-Warm': 'true' }
    });
  }
}
```

---

## 4. Maintenance Windows

### 4.1 Scheduled Maintenance Procedure

**Pre-Maintenance (T-72 hours)**:

```markdown
- [ ] Post maintenance notice to status page
- [ ] Send email notification to users
- [ ] Prepare rollback plan
- [ ] Test migration in staging environment
- [ ] Backup production database
- [ ] Notify on-call engineer and stakeholders
```

**During Maintenance (T-0)**:

```markdown
1. Disable write operations (maintenance mode)
   ```bash
   kubectl set env deployment/synapse-api MAINTENANCE_MODE=true
   ```

2. Deploy changes / run migrations
   ```bash
   npm run db:migrate
   kubectl apply -f new-deployment.yaml
   ```

3. Run smoke tests
   ```bash
   npm run test:smoke -- --env=production
   ```

4. Re-enable write operations
   ```bash
   kubectl set env deployment/synapse-api MAINTENANCE_MODE=false
   ```

5. Monitor for 30 minutes
   - Check error rates
   - Verify key user journeys
   - Confirm metrics normal

**Post-Maintenance (T+1 hour)**:

```markdown
- [ ] Update status page to "Complete"
- [ ] Send completion email to users
- [ ] Document any issues encountered
- [ ] Update runbook if needed
- [ ] Archive maintenance checklist
```

### 4.2 Emergency Maintenance

**Criteria**:
- Security vulnerability requiring immediate patch
- Data corruption requiring restore
- Critical bug causing service degradation

**Procedure**:
```markdown
1. Declare emergency maintenance (bypass 72hr notice)
2. Page engineering team + notify CTO
3. Post to status page: "Emergency Maintenance in Progress"
4. Execute fix with minimal scope
5. Test and restore service
6. Conduct post-mortem within 48 hours
```

---

## 5. Emergency Contacts

### 5.1 On-Call Schedule

| Week | Primary On-Call | Secondary On-Call | Phone |
|------|----------------|-------------------|-------|
| 1 | Alice Chen | Bob Kumar | +1-555-0101 |
| 2 | Bob Kumar | Carol Williams | +1-555-0102 |
| 3 | Carol Williams | David Lee | +1-555-0103 |
| 4 | David Lee | Alice Chen | +1-555-0104 |

**Rotation Start Date**: January 1, 2026  
**Handoff Time**: Monday 9:00 AM UTC

### 5.2 Escalation Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Engineering Lead | Sarah Johnson | +1-555-0201 | sarah@beingneuron.com |
| Research Lead | Michael Zhang | +1-555-0202 | michael@beingneuron.com |
| Security Officer | Jennifer Smith | +1-555-0203 | security@beingneuron.com |
| CTO | Robert Taylor | +1-555-0204 | cto@beingneuron.com |
| CEO | Emily Davis | +1-555-0205 | ceo@beingneuron.com |

### 5.3 Vendor Support

| Vendor | Support Portal | Emergency Contact | SLA |
|--------|---------------|-------------------|-----|
| Supabase | https://supabase.com/support | enterprise-support@supabase.com | 1 hour (Critical) |
| Vercel | https://vercel.com/support | support@vercel.com | 4 hours (Enterprise) |
| OpenAI | https://help.openai.com | enterprise-support@openai.com | 2 hours (P0) |
| Anthropic | https://anthropic.com/support | support@anthropic.com | 4 hours (Business) |
| PagerDuty | https://pagerduty.com/support | support@pagerduty.com | 1 hour (Critical) |

### 5.4 Internal Communication Channels

- **Slack**: #incidents (P0/P1), #engineering (P2/P3)
- **PagerDuty**: `beingneuron-production` service
- **Status Page**: https://status.beingneuron.com
- **War Room Bridge**: Zoom link posted in #incidents when P0 declared

---

## Appendix A: Useful Commands

### Database Queries

```sql
-- Count extraction jobs by status
SELECT status, count(*) 
FROM extraction_jobs 
GROUP BY status;

-- Find slowest extractions (last 24 hours)
SELECT paper_id, completed_at - created_at AS duration 
FROM extraction_jobs 
WHERE status = 'completed' 
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY duration DESC 
LIMIT 10;

-- Check cache hit rate by tier
SELECT 
  cache_tier,
  count(*) FILTER (WHERE hit = true)::float / count(*) AS hit_rate
FROM cache_events
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY cache_tier;
```

### Kubernetes Commands

```bash
# View pod status
kubectl get pods -l app=synapse

# View logs for specific pod
kubectl logs -f synapse-edge-abc123 -c edge-function

# Exec into running pod
kubectl exec -it synapse-edge-abc123 -- /bin/sh

# Restart deployment
kubectl rollout restart deployment/synapse-edge

# View deployment history
kubectl rollout history deployment/synapse-edge
```

### Monitoring Queries (Prometheus)

```promql
# Error rate over 5 minutes
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# p95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Cache hit rate
sum(rate(cache_hits_total[1h])) / sum(rate(cache_lookups_total[1h]))

# Token consumption rate
sum(rate(llm_tokens_used_total[1h])) by (model)
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-10 | Ops Team | Initial runbook |
| 1.1 | 2026-09-12 | Engineering | Added scaling procedures |
| 1.2 | 2026-09-14 | Security | Added emergency contacts |

## Related Documents

- [Production Hardening Specification](./production-hardening-spec.md)
- [E2E Test Suite Specification](./e2e-test-suite-spec.md)
- [Post-Mortem Template](./postmortem-template.md)
- [Release Certification Checklist](./release-certification.md)
