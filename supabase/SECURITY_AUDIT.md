# BeingNeuron · Security & Privacy Audit (Phase 15)

A point-by-point verification of the controls that protect user research
documents and data. Every claim below names the exact enforcement point —
nothing here relies on client-side behavior alone.

---

## 1. Authorization audit — "can user A touch user B's data?"

Every user-scoped table has RLS enabled with policies bound to
`auth.uid()` (the authenticated user id — never email, never a client-supplied
identifier). Supabase rejects any row the policy doesn't match, even when a
request forges `user_id` in the payload.

| Resource | Table | Select | Insert | Update | Delete | Notes |
|---|---|---|---|---|---|---|
| Papers / intake jobs | `paper_jobs` | own | own | own | own | 0002 |
| Extracted documents | `extracted_documents` | own | own | own | cascade from job | 0003 |
| Document chunks | `document_chunks` | own | own | — | cascade | 0003 |
| Research analyses | `research_analyses` | own | own | own | cascade | 0004 |
| AI usage log | `ai_usage_log` | own | own | — | cascade | 0004 |
| Knowledge graphs | `knowledge_graphs` | own | own | own | cascade | 0005 |
| Collections | `research_collections` | own | own (+feature gate) | own | own | 0006/0011 |
| Collection members | `collection_members` | via owned collection | via owned collection | — | via owned collection | 0006 |
| Paper architectures | `paper_architectures` | own | own | own | cascade | 0009 |
| NeuroSurgery progress | `nsg_progress` | own | own | own | own | 0008 |
| Profiles | `profiles` | own | own (trigger) | own | — | 0001 |
| Subscriptions | `subscriptions` | own | **none** | **none** | **none** | 0011 — webhook-owned |
| Usage events | `usage_events` | own | own (+quota trigger) | — | — | 0010 — append-only |
| Billing events | `billing_events` | own | **service role only** | — | — | 0011 |
| Storage objects | bucket `paper-intake` (private) | prefix `{uid}/…` | prefix `{uid}/…` | — | via job-delete / account-delete | 0002 |

**How to verify manually:** sign in as two users; as user A run

```sql
select count(*) from public.paper_jobs where user_id = '<user B id>';
```

from the Supabase SQL editor *with user A's JWT* (or via the JS client) — RLS
returns 0 regardless of the filter. The same holds for every table above.

**Demo mode** (no Supabase keys): every store filters by the signed-in demo
user id (`filterOwn` / explicit `user_id` checks in `SynapseProvider`,
`nsgProgress`, `usageTracking`), so accounts stay isolated per browser
session too. It is clearly labelled and not a production auth system.

## 2. Upload security audit

| Control | Where enforced | Status |
|---|---|---|
| Extension allowlist (`.pdf`) | `validatePdfFile` (`synapseCore`) — UI *and* re-run inside `submitPdf` | ✅ |
| MIME check (`application/pdf`) | same | ✅ |
| Real content check (`%PDF-` magic bytes) | same — reads first bytes; catches renamed non-PDFs | ✅ |
| Max size (25 MB, configurable) | `INTAKE_CONFIG.maxPdfBytes` client + bucket `file_size_limit` server | ✅ |
| Unique generated path | `makeObjectPath` = `{uid}/{uuid}-{sanitized-name}` | ✅ |
| Path-traversal safety | basename + whitelist `[A-Za-z0-9._-]`; traversal chars stripped | ✅ |
| Storage authorization | private bucket; insert/select policies require leading folder = `auth.uid()` | ✅ |
| No storage secrets in browser | anon key only; service role never bundled | ✅ |
| Temp cleanup | default retention purges PDF after structured data is saved (`saveResult`); `deleteJob` removes the object too | ✅ |
| Orphan cleanup | `account_deletion_requests` receipt + account-delete function sweeps `{uid}/` prefix | ✅ (0012) |

## 3. Rate limiting

| Surface | Protection | Layer |
|---|---|---|
| Login | Supabase Auth native throttling (per IP + per account) | server |
| Signup | Supabase Auth native throttling | server |
| Password reset emails | Supabase native (30/hour default) | server |
| Failed logins (demo mode) | 5 failures/email/hour → 15-minute lockout (`demoAuth`) | client (labelled) |
| PDF upload / arXiv import | 10 jobs/hour + 5 s cooldown client + `usage_events` daily quotas | client + **DB trigger** |
| Analysis creation | duplicate-billing unique index (one analysis charge per paper) + retry cap | **DB index** |
| AI processing | `ai_request` daily quota per plan, enforced by `enforce_usage_quotas` trigger | **DB trigger** |
| Expensive-repeat abuse | quotas resolve the caller's plan from `subscriptions` (fail-closed default 1) | **DB trigger** (0011) |

The database-level enforcement means a modified frontend **cannot** exceed
quotas — the insert is rejected before the metered work is recorded.

## 4. Retention policy (Phase 15)

- Default `purge_after_processing`: upload → temporary private storage →
  extraction stores structured text/chunks → **original PDF deleted**,
  `source_purged = true`.
- Optional `keep_originals` (set in Settings → Data & Privacy): the file is
  retained and re-attachable; `source_purged = false`.
- Deleting a job cascades to its document, chunks, analysis, graph,
  architecture and usage rows (FK `on delete cascade`).
- Account deletion removes every user row, storage prefix, and the auth user
  (`delete-account` Edge Function, service role, JWT-verified).

## 5. Known boundaries (honestly stated)

- Demo mode stores data in the browser only — it is an evaluation aid, not a
  production guarantee.
- Deep server-side PDF content inspection beyond the `%PDF-` header (e.g.
  embedded-JS scanning) is deferred; the private bucket + signed URLs limit
  blast radius.
- `delete-account` currently requires the function to be deployed; until
  then the deletion *request* is still recorded for manual follow-up.
