# Post-Mortem Template

## Incident Summary

| Field | Value |
|-------|-------|
| **Incident ID** | INC-YYYY-MM-DD-### |
| **Title** | [Brief description of incident] |
| **Date** | YYYY-MM-DD |
| **Duration** | X hours Y minutes |
| **Severity** | P0 / P1 / P2 / P3 |
| **Author** | [Name] |
| **Attendees** | [List of post-mortem participants] |

---

## Executive Summary

*[2-3 sentences summarizing what happened, impact, and resolution. Written for leadership/stakeholders who may not read the full document.]*

**Example**: On September 14, 2026, a database connection exhaustion incident caused extraction jobs to fail for 2 hours 15 minutes, affecting approximately 340 users. The root cause was a missing index on a frequently-queried column combined with a traffic spike from a new paper upload. The issue was resolved by adding the index and implementing connection pooling. No data loss occurred.

---

## Impact Assessment

### User Impact

| Metric | Value |
|--------|-------|
| Users Affected | ~XXX users (YY% of active user base) |
| Failed Requests | ZZ,ZZZ requests (AA% error rate during incident) |
| Data Loss | None / [describe if applicable] |
| Revenue Impact | $BBB (if applicable) |

### System Impact

| Service | Impact Duration | Degradation Level |
|---------|----------------|-------------------|
| Extraction Pipeline | 2h 15m | Complete failure |
| Graph Rendering | 2h 15m | Intermittent failures |
| Evidence Sync | 2h 15m | Degraded performance |
| Multi-Paper Synthesis | N/A | Unaffected |

### Scientific Impact

- **Extraction Jobs Lost**: XX jobs requiring re-processing
- **Evaluation Metrics Affected**: Entity F1 dropped from 0.84 → 0.76 during incident window
- **Gold Standard Violations**: None (no incorrect extractions, only failures)

---

## Timeline of Events

*All times in UTC*

| Time | Event | Actor/System |
|------|-------|--------------|
| 02:14 | Automated backup job starts, acquires DB connections | pg_cron |
| 02:17 | Traffic spike begins (new paper upload batch) | System |
| 02:19 | Connection pool reaches 95% capacity | Monitoring alert |
| 02:21 | First `too many clients` errors appear in logs | System |
| 02:23 | PagerDuty alert fires for high error rate | On-call notified |
| 02:28 | On-call acknowledges alert, joins incident channel | Alice Chen |
| 02:35 | Initial diagnosis: connection exhaustion suspected | Engineering team |
| 02:42 | Emergency scaling initiated (Edge Functions: 3→10) | Alice Chen |
| 02:51 | Scaling complete; error rate begins declining | System |
| 03:05 | Error rate returns to baseline (<1%) | Monitoring confirms |
| 03:12 | Incident declared resolved | On-call |
| 03:15 | Status page updated to "Resolved" | Ops team |

**Total Duration**: 2 hours 1 minute (detection to resolution)  
**Time to Detect**: 7 minutes  
**Time to Acknowledge**: 5 minutes  
**Time to Mitigate**: 43 minutes  
**Time to Resolve**: 51 minutes

---

## Root Cause Analysis

### Primary Cause

*[What directly caused the incident? Be specific and technical.]*

**Example**: A scheduled backup job (`pg_dump`) acquired 50 database connections simultaneously without respecting the application connection pool limits. This coincided with an unexpected traffic spike from a bulk paper upload (127 papers in 3 minutes vs typical 15 papers/hour), exhausting the maximum connection limit (200 connections).

### Contributing Factors

*[What conditions made the incident more likely or severe?]*

1. **Missing Index**: The `extraction_jobs.status` column lacked an index, causing full table scans that held connections longer than necessary (avg query time: 2.3s vs expected <100ms).

2. **No Connection Pooling**: Edge Functions connected directly to PostgreSQL without pgbouncer, preventing connection reuse.

3. **Insufficient Monitoring**: Alert threshold for connection count was set at 90%, leaving only 20 connections as buffer before failure.

4. **Backup Timing**: Backup job scheduled during historically low-traffic window (2 AM UTC), but this assumption no longer held due to global user base growth.

### Five Whys Analysis

```
1. Why did extraction jobs fail?
   → Database returned "too many clients" errors
   
2. Why were there too many clients?
   → Connection limit (200) was exceeded by backup job + application traffic
   
3. Why couldn't the system handle the load?
   → No connection pooling; each request created new DB connection
   
4. Why was there no connection pooling?
   → pgbouncer was not deployed; assumed unnecessary at current scale
   
5. Why was the assumption invalid?
   → Scale increased 3x since architecture decision; no review of connection strategy
```

---

## Lessons Learned

### What Went Well

- [ ] On-call responded within SLA (5 minutes)
- [ ] Incident channel established quickly
- [ ] Clear communication via status page
- [ ] No data loss or corruption
- [ ] Monitoring correctly identified error spike

### What Went Poorly

- [ ] Connection pool limits not reviewed after scale increase
- [ ] Backup job not designed with connection awareness
- [ ] Missing index on frequently-queried column
- [ ] Alert threshold left insufficient buffer
- [ ] No automatic mitigation (manual scaling required)

### Surprising Findings

- Traffic patterns had shifted significantly; 2 AM UTC no longer lowest-traffic window
- Single backup job consumed 25% of total connection pool
- Query performance degradation was 23x worse than baseline due to missing index

---

## Action Items

| ID | Action | Owner | Priority | Due Date | Status |
|----|--------|-------|----------|----------|--------|
| 1 | Deploy pgbouncer connection pooler | @alice | P0 | YYYY-MM-DD | ✅ Done |
| 2 | Add index on extraction_jobs.status | @bob | P0 | YYYY-MM-DD | ✅ Done |
| 3 | Lower connection alert threshold to 75% | @carol | P1 | YYYY-MM-DD | 🔄 In Progress |
| 4 | Reschedule backup job to 4 AM UTC | @alice | P1 | YYYY-MM-DD | ⏳ Pending |
| 5 | Implement auto-scaling for Edge Functions | @david | P2 | YYYY-MM-DD | ⏳ Pending |
| 6 | Add runbook for connection exhaustion | @ops-team | P1 | YYYY-MM-DD | ✅ Done |
| 7 | Review all long-running queries for missing indexes | @bob | P2 | YYYY-MM-DD | ⏳ Pending |

**Tracking**: All action items tracked in GitHub Projects board: [Link](https://github.com/beingneuron/synapse/projects/X)

---

## Prevention Strategy

### Immediate Fixes (Completed Within 48 Hours)

1. **Connection Pooler Deployment**: pgbouncer deployed with max 150 client connections, 200 server connections.
2. **Index Creation**: `CREATE INDEX idx_extraction_jobs_status ON extraction_jobs(status);`
3. **Alert Threshold Adjustment**: Connection warning at 75%, critical at 85%.

### Long-Term Improvements

1. **Automated Scaling**: HPA configured to scale Edge Functions based on connection queue depth.
2. **Query Performance Budget**: All queries must complete in <200ms p95; automated regression detection.
3. **Backup Job Redesign**: Implement streaming backup with bounded connection usage.
4. **Architecture Review**: Quarterly review of infrastructure assumptions against actual scale metrics.

### Process Changes

1. **Scale Trigger Points**: Define explicit thresholds (e.g., "When user count > 10K, review connection strategy")
2. **Pre-Launch Checklists**: Include index verification and load testing for new features
3. **Monitoring Review**: Monthly audit of alert thresholds and coverage gaps

---

## Appendices

### Appendix A: Relevant Logs

```log
[2026-09-14T02:19:23Z] ERROR: too many clients already
[2026-09-14T02:19:24Z] DETAIL:  Max connections (200) reached
[2026-09-14T02:19:25Z] HINT:  Consider using connection pooling
[2026-09-14T02:21:47Z] FATAL: connection limit exceeded for user "synapse_app"
```

### Appendix B: Dashboard Screenshots

*[Insert links to Grafana screenshots showing:*
- *Connection count over time*
- *Error rate spike*
- *Query duration anomaly*
- *Traffic pattern deviation*
*]*

### Appendix C: Related Incidents

| Incident ID | Date | Similarity |
|-------------|------|------------|
| INC-2026-07-22-001 | July 22, 2026 | Same root cause (connection exhaustion) |
| INC-2026-05-10-003 | May 10, 2026 | Similar trigger (backup job interference) |

### Appendix D: References

- [Production Hardening Specification](./production-hardening-spec.md)
- [Operations Runbook - Playbook A: Database Connection Exhaustion](./operations-runbook.md)
- [Database Indexing Best Practices](../engineering/db-indexing-guide.md)

---

## Sign-Off

| Role | Name | Date | Approval |
|------|------|------|----------|
| Author | [Name] | YYYY-MM-DD | ✅ |
| Engineering Lead | [Name] | YYYY-MM-DD | ✅ |
| Research Lead | [Name] | YYYY-MM-DD | ✅ |
| Security Officer | [Name] | YYYY-MM-DD | ✅ (if security-related) |

**Distribution**:
- engineering@beingneuron.com
- research@beingneuron.com
- stakeholders@beingneuron.com
- Posted to #engineering Slack channel

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Author] | Initial post-mortem |
| 1.1 | YYYY-MM-DD | [Editor] | Added action item status updates |

---

*Template Version: 1.2*  
*Last Updated: September 14, 2026*  
*Next Review: March 14, 2027*
