# Phase 2 Integration Map

**BeingNeuron Synapse Module - System Integration Documentation**  
**Scope:** Database → Edge Functions → Frontend Data Flows  
**Purpose:** Enable Phase 3+ development with clear integration contracts

---

## Overview

This document maps all integration points between the three core layers of the BeingNeuron Synapse Module:

1. **Database Layer** (PostgreSQL via Supabase)
2. **Edge Function Layer** (Deno-based serverless functions)
3. **Frontend Layer** (React + TypeScript)

Each integration point includes:
- Source and destination components
- Data schema/contract
- Authentication/authorization model
- Error handling expectations
- Version/dependency requirements

---

## Integration Point Inventory

### IP-001: User Signup → Profile Auto-Provisioning

**Flow:** `auth.users` → `profiles` table  
**Trigger:** New user registration  
**Mechanism:** Database trigger (`on_auth_user_created`)

```sql
-- Migration 0001
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

**Function:**
```typescript
// handle_new_user() - SECURITY DEFINER
insert into profiles (id, full_name, email)
values (new.id, new.raw_user_meta_data->>'full_name', new.email);
```

**Contract:**
| Field | Source | Transformation | Destination |
|-------|--------|----------------|-------------|
| id | auth.users.id | Direct copy | profiles.id (PK/FK) |
| full_name | auth.raw_user_meta_data.full_name | COALESCE to '' | profiles.full_name |
| email | auth.email | Direct copy | profiles.email |

**Error Handling:**
- Trigger runs with SECURITY DEFINER (elevated privileges)
- `ON CONFLICT DO NOTHING` prevents duplicate profile creation
- Race condition safe: multiple triggers won't create duplicates

**RLS Impact:**
- New user can immediately SELECT their own profile
- No manual provisioning required

---

### IP-002: Paper Upload → Job Creation

**Flow:** Frontend → Storage Bucket → paper_jobs table  
**Entry Point:** `POST /functions/v1/extract-paper` (indirect via job creation)

**Frontend Action:**
```typescript
// Upload to storage
const { data, error } = await supabase.storage
  .from('paper-intake')
  .upload(`${userId}/${uuid}-${safeName}`, file);

// Create job record
const { data: job } = await supabase
  .from('paper_jobs')
  .insert({
    user_id: userId,
    source_type: 'pdf',
    temporary_file_path: data.path,
    status: 'uploaded'
  });
```

**Storage Policy:**
```sql
-- Migration 0002
CREATE POLICY "intake_write_own_prefix"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'paper-intake'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Contract:**
| Field | Value | Constraints |
|-------|-------|-------------|
| user_id | auth.uid() | FK to auth.users |
| source_type | 'pdf' or 'arxiv' | CHECK constraint |
| temporary_file_path | `{userId}/{uuid}-{name}` | Must match storage path |
| status | 'uploaded' | Initial state |

**Authorization:**
- RLS policy ensures user can only upload to their own folder
- Job insert requires `auth.uid() = user_id`

---

### IP-003: Extraction Pipeline → Document Storage

**Flow:** `extract-paper` function → `extracted_documents` + `document_chunks`  
**Trigger:** Function invocation with `job_id`

**Function Logic:**
```typescript
// extract-paper/index.ts
const { data: docRow } = await admin
  .from("extracted_documents")
  .insert({
    job_id,
    user_id: userId,
    title: doc.title,
    authors: doc.authors, // JSONB
    sections: doc.sections, // JSONB array
    stats: {...} // JSONB
  })
  .select().single();

await admin.from("document_chunks").insert(
  chunks.map(c => ({
    document_id: docRow.id,
    user_id: userId,
    order_index: c.order_index,
    text: c.text,
    page_start: c.page_start
  }))
);
```

**Contract:**
```typescript
interface ExtractedDocument {
  id: string;           // UUID, auto-generated
  job_id: string;       // UUID, FK (UNIQUE)
  user_id: string;      // UUID, FK
  title: string;
  authors: Author[];    // JSONB array
  abstract: string;
  page_count: number;
  word_count: number;
  sections: Section[];  // JSONB array
  stats: DocStats;      // JSONB
}

interface DocumentChunk {
  id: string;           // UUID, auto-generated
  document_id: string;  // UUID, FK
  user_id: string;      // UUID, FK
  order_index: number;  // Unique per document
  section: string;
  kind: 'front' | 'body' | 'references';
  page_start: number;
  text: string;
  char_count: number;
}
```

**Transaction Semantics:**
- ⚠️ **Current:** No transaction wrapping (partial write risk)
- ✅ **Phase 2 Fix:** Wrap in RPC transaction

**Authorization:**
- Function uses service role (bypasses RLS)
- Explicit ownership check before processing: `job.user_id === userId`

---

### IP-004: Analysis Pipeline → Research Knowledge

**Flow:** `analyze-paper` function → `research_analyses` + `ai_usage_log`  
**Prerequisite:** `extracted_documents` must exist

**Function Logic:**
```typescript
// analyze-paper/index.ts
for (const chunk of chunks) {
  const llm = await callLlm(SYSTEM_PROMPT, buildChunkPrompt(chunk));
  // Process response, validate evidence
  agg.concepts.push(...validatedItems);
}

const analysis = {
  research_question,
  concepts: mergeByKey(agg.concepts),
  claims: mergeByKey(agg.claims),
  // ...
};

await admin.from("research_analyses").upsert({
  job_id,
  user_id: userId,
  document_id: doc.id,
  ...analysis,
  meta: { provider, model, prompt_tokens, completion_tokens, cost_usd }
}, { onConflict: "job_id" });

await admin.from("ai_usage_log").insert({
  user_id: userId,
  job_id,
  provider,
  model,
  requests,
  prompt_tokens,
  completion_tokens,
  cost_usd
});
```

**Contract:**
```typescript
interface ResearchAnalysis {
  id: string;              // UUID
  job_id: string;          // UUID, FK (UNIQUE)
  user_id: string;         // UUID, FK
  document_id: string;     // UUID, FK
  research_question: string | null;
  main_problem: string | null;
  conclusion: string | null;
  concepts: Concept[];     // JSONB array with evidence
  claims: Claim[];         // JSONB array with evidence
  methods: Method[];       // JSONB array
  results: Result[];       // JSONB array
  datasets: Dataset[];     // JSONB array
  experiments: Experiment[];// JSONB array
  limitations: Limitation[];// JSONB array
  relationships: Relationship[]; // JSONB array
  dropped_unsupported: number;
  meta: AnalysisMeta;      // JSONB
}

interface Concept {
  id: string;              // Generated client-side
  name: string;
  kind: string;
  explanation: string;
  confidence: number;      // 0-1
  uncertain: boolean;      // confidence < 0.45
  evidence: EvidenceReference[];
}

interface EvidenceReference {
  excerpt: string;         // Verbatim quote ≤240 chars
  page: number | null;
  section: string;
  chunk_id: string;        // References document_chunks
}
```

**Idempotency:**
- Upsert on `job_id` prevents duplicates
- ⚠️ **Gap:** Full re-analysis still runs (wastes tokens)
- ✅ **Phase 2 Fix:** Check for recent analysis first

---

### IP-005: Graph Generation → Visualization Storage

**Flow:** Frontend `buildKnowledgeGraph()` → `knowledge_graphs` table  
**Location:** Client-side transformation (not Edge Function)

**Frontend Logic:**
```typescript
// src/app/graphModel.ts
export function buildKnowledgeGraph(
  analysis: PaperAnalysis,
  jobId: string,
  paperTitle: string
): KnowledgeGraphData {
  // Deduplicate nodes by normalized label
  // Generate edges from co-occurrence and explicit relationships
  // Compute importance scores
  // Create level thresholds (overview/detailed/full)
  
  return {
    job_id: jobId,
    paper_title: truncate(paperTitle, 140),
    nodes: keptNodes,
    edges: prunedEdges,
    stats: { node_count, edge_count, levels },
    generated_at: new Date().toISOString()
  };
}
```

**Contract:**
```typescript
interface KnowledgeGraphData {
  job_id: string;          // UUID, FK (UNIQUE)
  paper_title: string;     // ≤140 chars
  nodes: GraphNode[];      // JSONB array
  edges: GraphEdge[];      // JSONB array
  stats: GraphStats;       // JSONB
  generated_at: string;    // ISO timestamp
}

interface GraphNode {
  id: string;
  type: GraphNodeType;     // Enum-like string
  label: string;           // ≤46 chars
  short_description: string; // ≤110 chars
  detailed_explanation: string; // ≤420 chars
  evidence_references: EvidenceReference[];
  confidence: number;      // 0-1
  importance: number;      // 0-1 composite score
  uncertain: boolean;
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;          // Node ID
  target: string;          // Node ID
  kind: RelationKind;      // Typed relationship
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
}
```

**Level Thresholds:**
```typescript
stats.levels = {
  overview: { nodes: 14, edges: 25, threshold: 0.72 },
  detailed: { nodes: 38, edges: 67, threshold: 0.45 },
  full: { nodes: 150, edges: 200, threshold: 0 }
};
```

**Storage:**
```typescript
await supabase.from('knowledge_graphs').upsert({
  job_id: jobId,
  ...graphData
}, { onConflict: 'job_id' });
```

---

### IP-006: Quota Enforcement → Usage Tracking

**Flow:** Frontend/Function → `usage_events` → `enforce_usage_quotas()` trigger  
**Enforcement Point:** BEFORE INSERT trigger on `usage_events`

**Trigger Logic:**
```sql
-- Migration 0011 (plan-aware version)
CREATE FUNCTION enforce_usage_quotas() RETURNS trigger AS $$
DECLARE
  v_plan TEXT;
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_plan := resolve_plan(new.user_id);
  
  SELECT daily_limit INTO v_limit
  FROM plan_limits
  WHERE plan_id = v_plan AND kind = new.kind;
  
  v_limit := COALESCE(v_limit, 1); -- Fail closed
  
  IF new.kind = 'ai_request' THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_used
    FROM usage_events
    WHERE user_id = new.user_id
      AND kind = new.kind
      AND created_at >= date_trunc('day', NOW());
    
    IF v_used + new.quantity > v_limit THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:%: plan % daily limit of % reached',
        new.kind, v_plan, v_limit;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_used
    FROM usage_events
    WHERE user_id = new.user_id
      AND kind = new.kind
      AND created_at >= date_trunc('day', NOW());
    
    IF v_used + 1 > v_limit THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:%: plan % daily limit of % reached',
        new.kind, v_plan, v_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Plan Resolution:**
```sql
CREATE FUNCTION resolve_plan(p_user UUID) RETURNS TEXT AS $$
DECLARE v_plan TEXT;
BEGIN
  SELECT plan_id INTO v_plan
  FROM subscriptions
  WHERE user_id = p_user
    AND status IN ('active', 'trialing', 'past_due');
  RETURN COALESCE(v_plan, 'free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Quota Configuration:**
```sql
-- Free plan
('free', 'paper_upload', 5)
('free', 'paper_analysis', 3)
('free', 'ai_request', 60)
('free', 'nsg_run', 25)
('free', 'collection_create', 1)

-- Researcher plan
('researcher', 'paper_upload', 40)
('researcher', 'paper_analysis', 25)
('researcher', 'ai_request', 250)

-- Pro plan
('pro', 'paper_upload', 60)
('pro', 'paper_analysis', 60)
('pro', 'ai_request', 400)
```

**Error Propagation:**
```typescript
try {
  await supabase.from('usage_events').insert(event);
} catch (err) {
  if (err.message.includes('QUOTA_EXCEEDED')) {
    // Show user-friendly quota message
    throw new QuotaExceededError(err.details);
  }
  throw err;
}
```

---

### IP-007: Feature Gates → Collection Access

**Flow:** Frontend → `require_feature()` function → `plan_features` table  
**Use Case:** Restrict collections to Researcher+ plans

**Function:**
```sql
CREATE FUNCTION require_feature(p_feature TEXT) RETURNS VOID AS $$
DECLARE
  v_plan TEXT;
  v_enabled BOOLEAN;
BEGIN
  v_plan := resolve_plan(auth.uid());
  
  SELECT enabled INTO v_enabled
  FROM plan_features
  WHERE plan_id = v_plan AND feature = p_feature;
  
  IF COALESCE(v_enabled, FALSE) = FALSE THEN
    RAISE EXCEPTION 'FEATURE_RESTRICTED:%: not available on plan %',
      p_feature, v_plan;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Trigger Enforcement:**
```sql
CREATE FUNCTION enforce_collection_feature() RETURNS trigger AS $$
BEGIN
  PERFORM require_feature('collections');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER research_collections_require_feature
  BEFORE INSERT ON research_collections
  FOR EACH ROW EXECUTE FUNCTION enforce_collection_feature();
```

**Frontend Integration:**
```typescript
// Pre-check before showing UI
const { data: subscription } = await supabase
  .from('subscriptions')
  .select('plan_id')
  .eq('user_id', user.id)
  .single();

const hasCollections = subscription?.plan_id !== 'free';

// Or let DB enforce and catch error
try {
  await supabase.from('research_collections').insert({ name, description });
} catch (err) {
  if (err.message.includes('FEATURE_RESTRICTED')) {
    showUpgradePrompt();
  }
}
```

---

### IP-008: Graph Rendering → Inspector Panel

**Flow:** `ForceGraph.tsx` → `WorkspacePage.tsx` (or similar)  
**Mechanism:** React props/callback pattern

**Props Interface:**
```typescript
interface ForceGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  highlightIds: Set<string> | null;  // Search matches
  focusRequest: { id: string; nonce: number } | null;
  resetNonce: number;
  zoomRequest?: { factor: number; nonce: number } | null;
  staticLayout?: boolean;
  nodeCount?: number;
  isFullscreen?: boolean;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
}
```

**Selection Flow:**
```typescript
// ForceGraph.tsx
onClick={(e) => {
  e.stopPropagation();
  onSelectNode(n.id);
  onSelectEdge(null);
}}

// WorkspacePage.tsx
const handleSelectNode = useCallback((nodeId: string | null) => {
  setSelectedNodeId(nodeId);
  // Fetch full node details if needed
  if (nodeId) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    setInspectorData({
      title: node.label,
      type: node.type,
      explanation: node.detailed_explanation,
      evidence: node.evidence_references,
      confidence: node.confidence,
      uncertain: node.uncertain
    });
  }
}, []);
```

**Evidence Linking:**
```typescript
// Inspector panel renders evidence with source links
{inspectorData.evidence.map((ev, i) => (
  <EvidenceCard
    key={i}
    excerpt={ev.excerpt}
    page={ev.page}
    section={ev.section}
    onClickSource={() => scrollToChunk(ev.chunk_id)}
  />
))}
```

---

### IP-009: Subscription Webhook → Plan Updates

**Flow:** Stripe → `stripe-webhook` function → `subscriptions` table  
**Security:** Webhook signature validation required

**Function Logic:**
```typescript
// stripe-webhook/index.ts
const sig = req.headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

switch (event.type) {
  case 'customer.subscription.created':
  case 'customer.subscription.updated':
    const sub = event.data.object;
    await admin.from('subscriptions').upsert({
      user_id: getUserIdFromCustomer(sub.customer),
      stripe_subscription_id: sub.id,
      plan_id: getPlanFromPrice(sub.items.data[0].price.id),
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end
    }, { onConflict: 'user_id' });
    break;
    
  case 'customer.subscription.deleted':
    await admin.from('subscriptions')
      .update({ status: 'canceled', plan_id: 'free' })
      .eq('stripe_subscription_id', event.data.object.id);
    break;
}
```

**RLS Policy:**
```sql
-- Users can ONLY read their own subscription
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- NO insert/update/delete policies for users
-- Only service role (webhook) can modify
```

**Plan Mapping:**
```typescript
const PRICE_TO_PLAN = {
  'price_researcher_monthly': 'researcher',
  'price_researcher_yearly': 'researcher',
  'price_pro_monthly': 'pro',
  'price_pro_yearly': 'pro',
};
```

---

### IP-010: Account Deletion → Cascade Cleanup

**Flow:** User → `delete-account` function → Multi-table cascade  
**Complexity:** High (multiple tables, storage objects)

**Function Logic:**
```typescript
// delete-account/index.ts
const userId = authUser.id;

// 1. Log deletion request
await admin.from('account_deletion_requests').insert({
  user_id: userId,
  status: 'requested'
});

try {
  // 2. Delete storage objects
  const { data: objects } = await admin.storage
    .from('paper-intake')
    .list(userId);
  
  if (objects) {
    await admin.storage
      .from('paper-intake')
      .remove(objects.map(o => `${userId}/${o.name}`));
  }
  
  // 3. Delete user data (cascades via FK)
  await admin.from('profiles').delete().eq('id', userId);
  // Cascades: paper_jobs → extracted_documents → document_chunks
  //         → research_analyses → knowledge_graphs
  //         → usage_events, ai_usage_log, etc.
  
  // 4. Mark deletion complete
  await admin.from('account_deletion_requests')
    .update({ status: 'completed' })
    .eq('user_id', userId);
  
  // 5. Call Supabase Admin API to delete auth user
  await fetch(`${SUPABASE_URL}/admin/v1/users/${userId}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY }
  });
  
} catch (err) {
  await admin.from('account_deletion_requests')
    .update({ status: 'failed', detail: err.message })
    .eq('user_id', userId);
  throw err;
}
```

**FK Cascade Chain:**
```
auth.users (deleted via Admin API)
  ↓ CASCADE
profiles
  ↓ CASCADE
paper_jobs
  ↓ CASCADE
extracted_documents, knowledge_graphs, research_analyses, paper_architectures
  ↓ CASCADE
document_chunks, ai_usage_log, etc.
```

**⚠️ Gap Identified:**
- `account_deletion_requests.user_id` lacks FK constraint
- If cascade fails, orphaned deletion request remains

**✅ Phase 2 Fix:**
```sql
ALTER TABLE account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

---

## Dependency Graph

```
┌─────────────┐
│ auth.users  │ (Supabase Auth)
└──────┬──────┘
       │
       ├─────────────────┬─────────────────┬──────────────┐
       ▼                 ▼                 ▼              ▼
┌───────────┐   ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│ profiles  │   │ subscriptions│  │ paper_jobs  │  │ nsg_progress │
└─────┬─────┘   └──────────────┘  └──────┬──────┘  └──────────────┘
      │                                  │
      │                    ┌─────────────┼─────────────┐
      │                    ▼             ▼             ▼
      │            ┌───────────┐  ┌──────────┐  ┌──────────────┐
      │            │extracted_ │  │research_ │  │knowledge_    │
      │            │documents  │  │analyses  │  │graphs        │
      │            └─────┬─────┘  └────┬─────┘  └──────────────┘
      │                  │             │
      │                  ▼             │
      │            ┌──────────┐        │
      │            │document_ │        │
      │            │chunks    │        │
      │            └──────────┘        │
      │                                │
      └────────────────┬───────────────┘
                       │
                       ▼
                ┌─────────────┐
                │ usage_events│
                │ ai_usage_log│
                │ billing_    │
                │ events      │
                └─────────────┘
```

---

## Error Propagation Matrix

| Layer | Error Type | Propagation | User Message |
|-------|-----------|-------------|--------------|
| DB Constraint | FK violation | → Function → Frontend | "Related record not found" |
| DB Constraint | CHECK violation | → Function → Frontend | "Invalid value provided" |
| DB Trigger | QUOTA_EXCEEDED | → Function → Frontend | "Daily limit reached. Upgrade plan." |
| DB Trigger | FEATURE_RESTRICTED | → Function → Frontend | "Feature not available on your plan" |
| Edge Function | LLM timeout | → Frontend | "Analysis timed out. Please retry." |
| Edge Function | Empty extraction | → Frontend | "Could not extract text. PDF may be scanned." |
| Edge Function | Unsupported layout | → Frontend | "Document format not supported." |
| Frontend | RLS denial | Silent fail | "Access denied" (logged) |
| Frontend | Network error | → Toast | "Connection failed. Check internet." |

---

## Version Compatibility Matrix

| Component | Min Version | Current | Notes |
|-----------|-------------|---------|-------|
| Supabase CLI | 1.0.0 | 1.x | Migration management |
| pdfjs-dist | 4.0.0 | 4.8.69 | Legacy build for Deno |
| @supabase/supabase-js | 2.0.0 | 2.98.0 | Client + Edge Function SDK |
| React | 18.0.0 | 18.2.0 | Hooks required |
| TypeScript | 5.0.0 | 5.7.0 | Strict mode enabled |
| Deno (Edge Functions) | 1.35.0 | Latest | Import maps for npm packages |

---

## Testing Contracts

### Unit Test Expectations

```typescript
// Schema tests
describe('Schema Constraints', () => {
  it('rejects negative cost_usd', async () => {
    await expect(db.insert({ cost_usd: -1 })).rejects.toThrow('chk_cost_usd_positive');
  });
  
  it('rejects ai_relevance outside 0-1', async () => {
    await expect(db.insert({ ai_relevance: 1.5 })).rejects.toThrow('chk_ai_relevance_range');
  });
});

// RLS tests
describe('RLS Policies', () => {
  it('prevents cross-user paper access', async () => {
    const user1Client = createClient(user1Token);
    const user2Paper = await createUser2Paper();
    
    const { data } = await user1Client
      .from('paper_jobs')
      .select()
      .eq('id', user2Paper.id);
    
    expect(data).toHaveLength(0);
  });
});

// Function tests
describe('extract-paper', () => {
  it('handles empty PDF gracefully', async () => {
    const response = await invokeFunction('extract-paper', { job_id: emptyPdfJob });
    expect(response.error).toContain('empty extraction');
  });
});
```

---

## Conclusion

This integration map documents all critical data flows between database, Edge Functions, and frontend layers. Phase 3 developers should reference this document when:

1. Adding new features that touch multiple layers
2. Debugging cross-layer issues
3. Planning performance optimizations
4. Implementing new authentication/authorization flows

**Key Integration Principles:**
- Database enforces constraints (don't trust client validation)
- Edge Functions use service role only for owned resources
- Frontend handles errors gracefully with user-friendly messages
- All mutations flow through RLS-protected tables
- Audit trails for sensitive operations (billing, deletions)

---

**Document Control**
- Version: 1.0
- Author: Phase 2 Integration Team
- Review Date: [Pending]
- Approval Status: [Pending]
