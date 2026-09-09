# Phase 2 Schema Forensics Report

**BeingNeuron Synapse Module - Database Schema Analysis**  
**Generated:** Phase 2 Schema Stabilization Initiative  
**Scope:** Migrations 0001-0012, Edge Functions, Frontend Integration

---

## Executive Summary

This report documents the complete forensic analysis of the BeingNeuron PostgreSQL schema as established through twelve sequential migrations. The audit reveals a **moderately healthy but incomplete schema** with critical gaps that must be addressed before Phase 3 (Modern PDF Parsing Integration) can proceed safely.

### Key Findings

| Category | Status | Critical Issues |
|----------|--------|-----------------|
| Migration Integrity | ⚠️ WARNING | Missing migration 0007 (gap between 0006 and 0008) |
| Foreign Key Coverage | ✅ GOOD | All major relationships constrained |
| RLS Enforcement | ✅ EXCELLENT | Comprehensive policies on all user-data tables |
| Index Optimization | ⚠️ NEEDS REVIEW | Some indexes may be redundant or missing |
| Check Constraints | ⚠️ PARTIAL | Enum validations present, domain checks incomplete |
| Trigger Coverage | ✅ GOOD | Updated_at triggers consistently applied |

---

## Migration History Analysis

### Sequential Migration Audit

#### Migration 0001: `profiles.sql` (Phase 2)
**Purpose:** User profiles table with auto-provisioning  
**Tables Created:** `profiles`  
**Functions Created:** `handle_new_user()`, `set_updated_at()`  
**RLS Policies:** 3 (select/insert/update own)  
**Status:** ✅ STABLE

**Key Features:**
- Primary key references `auth.users(id)` with CASCADE delete
- Automatic profile creation via trigger on `auth.users` insert
- RLS bound to `auth.uid()` - never email or client-supplied identifiers
- Updated_at trigger for timestamp management

**Issues:** None identified

---

#### Migration 0002: `synapse_jobs.sql` (Phase 4)
**Purpose:** Paper intake job tracking  
**Tables Created:** `paper_jobs`  
**Storage Bucket:** `paper-intake` (25MB limit, PDF only)  
**RLS Policies:** 4 (select/insert/update/delete own) + storage policies  
**Status:** ✅ STABLE

**Key Features:**
- Status enum: uploaded, queued, processing, completed, failed
- Dual source support: PDF upload or arXiv import
- Unique constraint on `(user_id, arxiv_id)` for duplicate prevention
- Storage policies enforce user-scoped prefixes: `{user_id}/{uuid}-{name}`

**Issues:**
- Status enum expanded in later migrations without cleanup (legacy values remain)

---

#### Migration 0003: `extraction.sql` (Phase 5)
**Purpose:** Document extraction pipeline  
**Tables Created:** `extracted_documents`, `document_chunks`  
**Dependencies:** 0001, 0002  
**Status:** ✅ STABLE

**Schema Details:**
```sql
extracted_documents:
  - id (UUID, PK)
  - job_id (UUID, FK → paper_jobs, UNIQUE)
  - user_id (UUID, FK → auth.users)
  - title, authors (JSONB), abstract
  - page_count, word_count, char_count
  - sections (JSONB), captions (JSONB)
  - stats (JSONB)

document_chunks:
  - id (UUID, PK)
  - document_id (UUID, FK → extracted_documents)
  - user_id (UUID, FK → auth.users)
  - order_index (INT, unique per document)
  - kind (ENUM: front, body, references)
  - page_start, page_end, text, char_count
```

**Issues:**
- JSONB columns lack schema validation constraints
- No full-text search indexes on text content

---

#### Migration 0004: `analysis.sql` (Phase 6)
**Purpose:** AI analysis results storage  
**Tables Created:** `research_analyses`, `ai_usage_log`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
research_analyses:
  - id (UUID, PK)
  - job_id (UUID, FK → paper_jobs, UNIQUE)
  - user_id, document_id (FKs)
  - research_question, main_problem, conclusion (TEXT)
  - concepts, claims, methods, results, datasets, experiments, limitations (JSONB arrays)
  - relationships (JSONB array)
  - dropped_unsupported (INT)
  - meta (JSONB)

ai_usage_log:
  - id (UUID, PK)
  - user_id, job_id (FKs)
  - provider, model, requests
  - prompt_tokens, completion_tokens, cost_usd
  - failure (BOOLEAN)
```

**Issues:**
- No check constraint on `dropped_unsupported >= 0`
- `cost_usd` lacks `>= 0` constraint

---

#### Migration 0005: `knowledge_graphs.sql` (Phase 7)
**Purpose:** Visualization-optimized graph data  
**Tables Created:** `knowledge_graphs`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
knowledge_graphs:
  - id (UUID, PK)
  - job_id (UUID, FK → paper_jobs, UNIQUE)
  - user_id (FK)
  - paper_title (TEXT)
  - nodes (JSONB array)
  - edges (JSONB array)
  - stats (JSONB)
  - generated_at, created_at, updated_at
```

**Issues:**
- Graph data stored as monolithic JSONB blobs
- No normalized node/edge tables for efficient querying
- Cannot query cross-paper relationships without full JSON parse

---

#### Migration 0006: `library.sql` (Phase 9)
**Purpose:** Research library and collections  
**Tables Created:** `research_collections`, `collection_members`  
**Columns Added:** `paper_jobs.analysis_stats`, `paper_jobs.graph_stats`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
research_collections:
  - id (UUID, PK)
  - user_id (FK)
  - name (TEXT, 1-120 chars)
  - description (TEXT)

collection_members:
  - collection_id (FK → research_collections)
  - job_id (FK → paper_jobs)
  - added_at
  - PRIMARY KEY (collection_id, job_id)
```

**Issues:**
- `collection_members` lacks RLS policy for UPDATE operations

---

#### Migration 0007: **MISSING**
**CRITICAL GAP:** No migration file 0007 exists between 0006 (library) and 0008 (challenge progress).

**Investigation Required:**
- Was 0007 created and deleted?
- Does it exist in another branch?
- Was it applied manually to production?

**Action Items:**
1. Query production `schema_migrations` table to verify if 0007 was applied
2. If applied, retrieve SQL from production dump
3. If not applied, determine if functionality was rolled back

---

#### Migration 0008: `challenge_progress.sql` (Phase 11)
**Purpose:** NeuroSurgery challenge progress tracking  
**Tables Created:** `nsg_progress`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
nsg_progress:
  - user_id (UUID, FK)
  - scenario_id (TEXT)
  - difficulty (ENUM: beginner, intermediate, advanced)
  - attempts, completed, completed_at
  - best_val_acc, best_val_loss, best_steps
  - diagnoses (JSONB array)
  - PRIMARY KEY (user_id, scenario_id, difficulty)
```

**Issues:** None identified

---

#### Migration 0009: `architectures.sql` (Phase 12)
**Purpose:** Paper architecture extraction  
**Tables Created:** `paper_architectures`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
paper_architectures:
  - id (UUID, PK)
  - job_id (UUID, FK → paper_jobs, UNIQUE)
  - user_id (FK)
  - ai_relevance (NUMERIC(4,2), 0-1)
  - ai_topics (JSONB array)
  - sufficiency (ENUM: detailed, partial, insufficient, none)
  - components, training, numeric_hints (JSONB)
  - summary (TEXT)
```

**Issues:**
- `ai_relevance` lacks CHECK constraint for 0-1 range

---

#### Migration 0010: `usage.sql` (Phase 13)
**Purpose:** Usage metering and quota enforcement  
**Tables Created:** `usage_events`  
**Functions Created:** `enforce_usage_quotas()`  
**Triggers Created:** `usage_events_enforce_quotas` (BEFORE INSERT)  
**Status:** ✅ STABLE

**Schema Details:**
```sql
usage_events:
  - id (UUID, PK)
  - user_id (FK)
  - kind (ENUM: paper_upload, paper_analysis, ai_request, nsg_run, collection_create)
  - quantity (INT, >0)
  - prompt_tokens, completion_tokens, cost_usd, bytes
  - ref_id (UUID, references job/analysis/collection)
  - detail (TEXT)
```

**Indexes:**
- `usage_events_user_time_idx` (user_id, created_at DESC)
- `usage_events_kind_day_idx` (user_id, kind, created_at)
- `usage_events_analysis_unique` (unique on user_id, ref_id WHERE kind='paper_analysis')
- `usage_events_analysis_retry_guard` (unique on user_id, ref_id, date WHERE kind='paper_analysis')

**Issues:** None identified - well-designed quota enforcement

---

#### Migration 0011: `billing.sql` (Phase 14)
**Purpose:** Billing & subscriptions with Stripe integration  
**Tables Created:** `plan_limits`, `plan_features`, `subscriptions`, `billing_events`  
**Functions Created:** `resolve_plan()`, updated `enforce_usage_quotas()`, `require_feature()`, `enforce_collection_feature()`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
plan_limits:
  - plan_id (TEXT, PK part)
  - kind (TEXT, PK part)
  - daily_limit (INT, >=0)
  - PRIMARY KEY (plan_id, kind)

plan_features:
  - plan_id (TEXT, PK part)
  - feature (TEXT, PK part)
  - enabled (BOOLEAN)
  - PRIMARY KEY (plan_id, feature)

subscriptions:
  - user_id (UUID, PK, FK → auth.users)
  - stripe_customer_id, stripe_subscription_id
  - plan_id (default 'free')
  - status (ENUM: active, trialing, past_due, canceled, incomplete)
  - current_period_end, cancel_at_period_end

billing_events:
  - id (UUID, PK)
  - user_id (FK)
  - kind, detail
  - created_at
```

**Security Model:**
- `subscriptions` writable ONLY by service role (Stripe webhook)
- Users have SELECT-only access to their own subscription
- Quota enforcement resolves plan from database, not client input

**Issues:** None identified - excellent security design

---

#### Migration 0012: `privacy.sql` (Phase 15)
**Purpose:** Data responsibility and retention  
**Columns Added:** `profiles.retention_policy`  
**Tables Created:** `account_deletion_requests`  
**Status:** ✅ STABLE

**Schema Details:**
```sql
profiles.retention_policy:
  - ENUM: purge_after_processing (default), keep_originals

account_deletion_requests:
  - id (UUID, PK)
  - user_id (UUID)
  - status (ENUM: requested, completed, failed)
  - detail (TEXT)
  - created_at
```

**Issues:**
- `account_deletion_requests.user_id` lacks FK constraint to `auth.users`
- No RLS policy for DELETE operations on deletion requests

---

## Entity-Relationship Diagram

```
┌─────────────────┐         ┌──────────────────┐
│   auth.users    │         │   profiles       │
│  (Supabase Mgmt)│◄───────►│  id (PK, FK)     │
└────────┬────────┘         │  retention_policy│
         │                  └──────────────────┘
         │
         ▼
┌─────────────────┐
│   paper_jobs    │
│  id (PK)        │
│  user_id (FK)   │
│  status (ENUM)  │
│  source_type    │
│  document_id ───┼───┐
└────────┬────────┘    │
         │             │
         ├─────────────┼──────────────────────┐
         │             │                      │
         ▼             ▼                      ▼
┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐
│extracted_docs   │ │research_analyses│ │knowledge_graphs │
│id (PK)          │ │id (PK)           │ │id (PK)          │
│job_id (FK,UNIQ) │ │job_id (FK,UNIQ)  │ │job_id (FK,UNIQ) │
│document_id      │ │document_id (FK)──┤ │nodes (JSONB)    │
│sections (JSONB) │ │concepts (JSONB)  │ │edges (JSONB)    │
└────────┬────────┘ └──────────────────┘ └─────────────────┘
         │
         ▼
┌─────────────────┐
│ document_chunks │
│id (PK)          │
│document_id (FK) │
│order_index      │
│text             │
└─────────────────┘

┌─────────────────┐         ┌──────────────────┐
│ research_cols   │◄────────│ collection_members│
│id (PK)          │         │collection_id (FK) │
│user_id (FK)     │         │job_id (FK)        │
└─────────────────┘         └──────────────────┘

┌─────────────────┐         ┌──────────────────┐
│  usage_events   │         │  subscriptions   │
│id (PK)          │         │user_id (PK, FK)  │
│user_id (FK)     │◄────────│plan_id           │
│kind (ENUM)      │         │status (ENUM)     │
│ref_id           │         └────────┬─────────┘
└─────────────────┘                  │
         ▲                           │
         │              ┌────────────▼────────┐
         │              │   plan_limits       │
         └──────────────│   plan_features     │
                        └─────────────────────┘

┌─────────────────┐         ┌──────────────────┐
│ nsg_progress    │         │paper_architectures│
│user_id (PK pt)  │         │job_id (FK,UNIQ)   │
│scenario_id      │         │ai_relevance       │
│difficulty       │         │sufficiency (ENUM) │
└─────────────────┘         └──────────────────┘

┌──────────────────────┐
│account_deletion_reqs │
│id (PK)               │
│user_id (NO FK!) ⚠️   │
│status (ENUM)         │
└──────────────────────┘
```

---

## Identified Issues by Priority

### CRITICAL (Block Phase 3)

| ID | Issue | Table | Impact | Remediation |
|----|-------|-------|--------|-------------|
| C1 | Missing migration 0007 | N/A | Schema drift risk | Investigate and recreate |
| C2 | No FK on account_deletion_requests.user_id | account_deletion_requests | Orphaned records possible | Add FK constraint |

### HIGH (Should Fix in Phase 2)

| ID | Issue | Table | Impact | Remediation |
|----|-------|-------|--------|-------------|
| H1 | No CHECK on ai_relevance range | paper_architectures | Invalid values possible | Add `CHECK (ai_relevance BETWEEN 0 AND 1)` |
| H2 | No CHECK on cost_usd >= 0 | research_analyses, ai_usage_log, usage_events | Negative costs possible | Add constraint |
| H3 | No CHECK on dropped_unsupported >= 0 | research_analyses | Negative counts possible | Add constraint |
| H4 | collection_members missing UPDATE RLS | collection_members | Potential unauthorized updates | Add policy |

### MEDIUM (Defer to Phase 3-4)

| ID | Issue | Table | Impact | Remediation |
|----|-------|-------|--------|-------------|
| M1 | JSONB columns lack schema validation | Multiple | Invalid JSON structure possible | Add CHECK with jsonb_schema_valid |
| M2 | No full-text search indexes | document_chunks.text | Slow text search | Add GIN index |
| M3 | Redundant status enum values | paper_jobs | Confusion, legacy baggage | Clean up after migration |

### LOW (Backlog)

| ID | Issue | Table | Impact | Remediation |
|----|-------|-------|--------|-------------|
| L1 | No soft-delete mechanism | All tables | Accidental permanent deletes | Add deleted_at column |
| L2 | No audit trail | Critical tables | No change history | Implement audit logging |

---

## Index Analysis

### Current Indexes by Table

**profiles:**
- `profiles_email_idx` (email) ✅

**paper_jobs:**
- `paper_jobs_user_created_idx` (user_id, created_at DESC) ✅
- `paper_jobs_user_status_idx` (user_id, status) ✅
- `paper_jobs_unique_arxiv_per_user` (user_id, arxiv_id) WHERE arxiv_id IS NOT NULL ✅
- `paper_jobs_document_idx` (document_id) ✅

**extracted_documents:**
- `extracted_documents_user_idx` (user_id, created_at DESC) ✅

**document_chunks:**
- `document_chunks_doc_idx` (document_id, order_index) ✅
- `document_chunks_user_idx` (user_id) ⚠️ REDUNDANT? (covered by doc_idx join)

**research_analyses:**
- `research_analyses_user_idx` (user_id, created_at DESC) ✅

**knowledge_graphs:**
- `knowledge_graphs_user_idx` (user_id, created_at DESC) ✅

**research_collections:**
- `research_collections_user_idx` (user_id, created_at DESC) ✅

**collection_members:**
- `collection_members_job_idx` (job_id) ✅

**nsg_progress:**
- `nsg_progress_user_idx` (user_id, updated_at DESC) ✅

**paper_architectures:**
- `paper_architectures_user_idx` (user_id) ✅

**usage_events:**
- `usage_events_user_time_idx` (user_id, created_at DESC) ✅
- `usage_events_kind_day_idx` (user_id, kind, created_at) ✅
- `usage_events_analysis_unique` (user_id, ref_id) WHERE kind='paper_analysis' ✅
- `usage_events_analysis_retry_guard` (user_id, ref_id, created_at::date) WHERE kind='paper_analysis' ✅

**ai_usage_log:**
- `ai_usage_log_user_idx` (user_id, created_at DESC) ✅

**billing_events:**
- `billing_events_user_idx` (user_id, created_at DESC) ✅

### Recommended Index Additions

```sql
-- Full-text search on document chunks
CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_text_fts_idx
  ON public.document_chunks USING GIN (to_tsvector('english', text));

-- Faster graph node/edge queries (if normalized in Phase 3)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS graph_nodes_paper_idx
--   ON public.graph_nodes (paper_id);

-- Audit log performance (if added)
-- CREATE INDEX audit_log_table_record_idx ON audit_log (table_name, record_id);
```

---

## RLS Policy Matrix

### Complete Policy Inventory

| Table | Operation | Policy Name | Condition | Status |
|-------|-----------|-------------|-----------|--------|
| profiles | SELECT | profiles_select_own | auth.uid() = id | ✅ |
| profiles | INSERT | profiles_insert_own | auth.uid() = id | ✅ |
| profiles | UPDATE | profiles_update_own | auth.uid() = id | ✅ |
| paper_jobs | SELECT | paper_jobs_select_own | auth.uid() = user_id | ✅ |
| paper_jobs | INSERT | paper_jobs_insert_own | auth.uid() = user_id | ✅ |
| paper_jobs | UPDATE | paper_jobs_update_own | auth.uid() = user_id | ✅ |
| paper_jobs | DELETE | paper_jobs_delete_own | auth.uid() = user_id | ✅ |
| extracted_documents | SELECT | extracted_documents_select_own | auth.uid() = user_id | ✅ |
| extracted_documents | INSERT | extracted_documents_insert_own | auth.uid() = user_id | ✅ |
| extracted_documents | UPDATE | extracted_documents_update_own | auth.uid() = user_id | ✅ |
| document_chunks | SELECT | document_chunks_select_own | auth.uid() = user_id | ✅ |
| document_chunks | INSERT | document_chunks_insert_own | auth.uid() = user_id | ✅ |
| research_analyses | SELECT | research_analyses_select_own | auth.uid() = user_id | ✅ |
| research_analyses | INSERT | research_analyses_insert_own | auth.uid() = user_id | ✅ |
| research_analyses | UPDATE | research_analyses_update_own | auth.uid() = user_id | ✅ |
| knowledge_graphs | SELECT | knowledge_graphs_select_own | auth.uid() = user_id | ✅ |
| knowledge_graphs | INSERT | knowledge_graphs_insert_own | auth.uid() = user_id | ✅ |
| knowledge_graphs | UPDATE | knowledge_graphs_update_own | auth.uid() = user_id | ✅ |
| knowledge_graphs | DELETE | knowledge_graphs_delete_own | auth.uid() = user_id | ✅ |
| research_collections | SELECT | collections_select_own | auth.uid() = user_id | ✅ |
| research_collections | INSERT | collections_insert_own | auth.uid() = user_id | ✅ |
| research_collections | UPDATE | collections_update_own | auth.uid() = user_id | ✅ |
| research_collections | DELETE | collections_delete_own | auth.uid() = user_id | ✅ |
| collection_members | SELECT | members_select_own | EXISTS (SELECT 1 FROM collections WHERE id=collection_id AND user_id=auth.uid()) | ✅ |
| collection_members | INSERT | members_insert_own | EXISTS (SELECT 1 FROM collections WHERE id=collection_id AND user_id=auth.uid()) | ✅ |
| collection_members | DELETE | members_delete_own | EXISTS (SELECT 1 FROM collections WHERE id=collection_id AND user_id=auth.uid()) | ✅ |
| collection_members | UPDATE | **MISSING** | N/A | ❌ |
| nsg_progress | SELECT | nsg_progress_select_own | auth.uid() = user_id | ✅ |
| nsg_progress | INSERT | nsg_progress_insert_own | auth.uid() = user_id | ✅ |
| nsg_progress | UPDATE | nsg_progress_update_own | auth.uid() = user_id | ✅ |
| paper_architectures | SELECT | paper_architectures_select_own | auth.uid() = user_id | ✅ |
| paper_architectures | INSERT | paper_architectures_insert_own | auth.uid() = user_id | ✅ |
| paper_architectures | UPDATE | paper_architectures_update_own | auth.uid() = user_id | ✅ |
| usage_events | SELECT | usage_events_select_own | auth.uid() = user_id | ✅ |
| usage_events | INSERT | usage_events_insert_own | auth.uid() = user_id | ✅ |
| ai_usage_log | SELECT | ai_usage_log_select_own | auth.uid() = user_id | ✅ |
| ai_usage_log | INSERT | ai_usage_log_insert_own | auth.uid() = user_id | ✅ |
| plan_limits | SELECT | plan_limits_read | TRUE (public read) | ✅ |
| plan_features | SELECT | plan_features_read | TRUE (public read) | ✅ |
| subscriptions | SELECT | subscriptions_select_own | auth.uid() = user_id | ✅ |
| subscriptions | INSERT | NONE (service role only) | Intentional | ✅ |
| subscriptions | UPDATE | NONE (service role only) | Intentional | ✅ |
| subscriptions | DELETE | NONE (cascade only) | Intentional | ✅ |
| billing_events | SELECT | billing_events_select_own | auth.uid() = user_id | ✅ |
| account_deletion_requests | SELECT | deletion_requests_select_own | auth.uid() = user_id | ✅ |
| account_deletion_requests | INSERT | deletion_requests_insert_own | auth.uid() = user_id | ✅ |

### Storage Bucket Policies

| Bucket | Operation | Policy Name | Condition | Status |
|--------|-----------|-------------|-----------|--------|
| paper-intake | INSERT | intake_write_own_prefix | bucket_id='paper-intake' AND foldername[1]=auth.uid() | ✅ |
| paper-intake | SELECT | intake_read_own_prefix | bucket_id='paper-intake' AND foldername[1]=auth.uid() | ✅ |

### RLS Enforcement Verification

All user-data tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` applied except:
- `plan_limits` and `plan_features`: Intentionally public read
- `account_deletion_requests`: RLS enabled but FORCE not explicitly set

**Recommendation:** Add `FORCE ROW LEVEL SECURITY` to `account_deletion_requests`.

---

## Stored Procedures and Functions Inventory

### Functions

| Name | Purpose | Security Context | Status |
|------|---------|------------------|--------|
| `handle_new_user()` | Auto-create profile on signup | SECURITY DEFINER | ✅ |
| `set_updated_at()` | Update timestamp trigger | INVOKER | ✅ |
| `enforce_usage_quotas()` | Quota enforcement trigger | SECURITY DEFINER | ✅ |
| `resolve_plan(user_id)` | Get user's subscription plan | SECURITY DEFINER | ✅ |
| `require_feature(feature)` | Feature gate check | SECURITY DEFINER | ✅ |
| `enforce_collection_feature()` | Collection creation gate | SECURITY DEFINER | ✅ |

### Triggers

| Name | Table | Timing | Purpose | Status |
|------|-------|--------|---------|--------|
| `profiles_set_updated_at` | profiles | BEFORE UPDATE | Timestamp | ✅ |
| `on_auth_user_created` | auth.users | AFTER INSERT | Profile provisioning | ✅ |
| `paper_jobs_set_updated_at` | paper_jobs | BEFORE UPDATE | Timestamp | ✅ |
| `extracted_documents_set_updated_at` | extracted_documents | BEFORE UPDATE | Timestamp | ✅ |
| `research_analyses_set_updated_at` | research_analyses | BEFORE UPDATE | Timestamp | ✅ |
| `knowledge_graphs_set_updated_at` | knowledge_graphs | BEFORE UPDATE | Timestamp | ✅ |
| `research_collections_set_updated_at` | research_collections | BEFORE UPDATE | Timestamp | ✅ |
| `nsg_progress_set_updated_at` | nsg_progress | BEFORE UPDATE | Timestamp | ✅ |
| `paper_architectures_set_updated_at` | paper_architectures | BEFORE UPDATE | Timestamp | ✅ |
| `subscriptions_set_updated_at` | subscriptions | BEFORE UPDATE | Timestamp | ✅ |
| `usage_events_enforce_quotas` | usage_events | BEFORE INSERT | Quota enforcement | ✅ |
| `research_collections_require_feature` | research_collections | BEFORE INSERT | Feature gate | ✅ |

---

## Recommendations for Phase 2

### Immediate Actions (Before Phase 3)

1. **Investigate Migration 0007**
   ```sql
   -- Check if 0007 exists in production
   SELECT * FROM supabase_migrations.schema_migrations 
   WHERE version = '0007' ORDER BY applied_at;
   ```

2. **Add Missing FK Constraint**
   ```sql
   ALTER TABLE account_deletion_requests
     ADD CONSTRAINT account_deletion_requests_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
   ```

3. **Add Missing RLS Policy**
   ```sql
   DROP POLICY IF EXISTS "members_update_own" ON collection_members;
   CREATE POLICY "members_update_own"
     ON collection_members FOR UPDATE
     USING (EXISTS (
       SELECT 1 FROM research_collections c
       WHERE c.id = collection_id AND c.user_id = auth.uid()
     ));
   ```

4. **Add Check Constraints**
   ```sql
   ALTER TABLE paper_architectures
     ADD CONSTRAINT chk_ai_relevance_range 
     CHECK (ai_relevance BETWEEN 0 AND 1);
   
   ALTER TABLE research_analyses
     ADD CONSTRAINT chk_dropped_unsupported_positive
     CHECK (dropped_unsupported >= 0);
   
   ALTER TABLE ai_usage_log
     ADD CONSTRAINT chk_cost_usd_positive
     CHECK (cost_usd >= 0);
   
   ALTER TABLE usage_events
     ADD CONSTRAINT chk_usage_cost_positive
     CHECK (cost_usd >= 0);
   ```

5. **Enable FORCE RLS**
   ```sql
   ALTER TABLE account_deletion_requests FORCE ROW LEVEL SECURITY;
   ```

### Deferred Actions (Phase 3-4)

1. Normalize graph nodes/edges into separate tables
2. Add full-text search indexes
3. Implement JSONB schema validation
4. Add audit logging trigger system
5. Clean up legacy status enum values

---

## Conclusion

The BeingNeuron schema demonstrates **strong foundational design** with comprehensive RLS policies, proper foreign key relationships, and thoughtful quota enforcement. However, the **missing migration 0007** represents a critical gap that must be resolved before proceeding with Phase 3.

The remediation tasks identified in this report are prerequisites for stable schema evolution. Without addressing these issues, Phase 3 risks building on an unstable foundation, potentially leading to data corruption, security gaps, or performance degradation.

**Next Step:** Execute Phase 2 Workstream A (Schema Remediation) to address Critical and High priority issues before commencing Phase 3.

---

**Document Control**
- Version: 1.0
- Author: Phase 2 Schema Stabilization Team
- Review Date: [Pending Stakeholder Review]
- Approval Status: [Pending]
