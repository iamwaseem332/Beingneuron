-- ============================================================
-- BeingNeuron · Phase 6 · Migration 0004
-- AI analysis: research_analyses (evidence-backed structured
-- knowledge) + ai_usage_log (provider/token/cost accounting).
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0002_synapse_jobs.sql, 0003_extraction.sql
-- ============================================================

-- ---------- expanded job lifecycle (analysis stages) ----------
-- ready_for_analysis → analyzing_concepts → analyzing_methodology
--   → extracting_claims → mapping_evidence → finalizing → analyzed
alter table public.paper_jobs
  drop constraint if exists paper_jobs_status_check;

alter table public.paper_jobs
  add constraint paper_jobs_status_check
  check (status in (
    'uploaded', 'queued',
    'extracting', 'normalizing', 'chunking',
    'ready_for_analysis',
    'analyzing_concepts', 'analyzing_methodology', 'extracting_claims',
    'mapping_evidence', 'finalizing', 'analyzed',
    'processing', 'completed',   -- legacy, kept for compatibility
    'failed'
  ));

-- ---------- research analyses (structured representation) ----------
-- One row per analyzed job. Every array element carries its own evidence
-- references (excerpt + page + section + chunk_id); items without evidence
-- are dropped by the pipeline before insert and counted in
-- `dropped_unsupported` — BeingNeuron never persists unsupported facts.
create table if not exists public.research_analyses (
  id                  uuid        primary key default gen_random_uuid(),
  job_id              uuid        not null references public.paper_jobs (id) on delete cascade,
  user_id             uuid        not null references auth.users (id) on delete cascade,
  document_id         uuid        references public.extracted_documents (id) on delete set null,
  research_question   text,
  main_problem        text,
  conclusion          text,
  concepts            jsonb       not null default '[]'::jsonb,
  claims              jsonb       not null default '[]'::jsonb,
  methods             jsonb       not null default '[]'::jsonb,
  results             jsonb       not null default '[]'::jsonb,
  datasets            jsonb       not null default '[]'::jsonb,
  experiments         jsonb       not null default '[]'::jsonb,
  limitations         jsonb       not null default '[]'::jsonb,
  relationships       jsonb       not null default '[]'::jsonb,
  dropped_unsupported integer     not null default 0,
  meta                jsonb       not null default '{}'::jsonb,   -- provider, model, usage
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint research_analyses_job_id_key unique (job_id)
);

create index if not exists research_analyses_user_idx
  on public.research_analyses (user_id, created_at desc);

drop trigger if exists research_analyses_set_updated_at on public.research_analyses;
create trigger research_analyses_set_updated_at
  before update on public.research_analyses
  for each row execute procedure public.set_updated_at();

-- ---------- AI usage / cost accounting ----------
-- One row per analysis request. Lets us track requests, token usage and
-- approximate cost per provider without exposing any API key.
create table if not exists public.ai_usage_log (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  job_id            uuid        references public.paper_jobs (id) on delete set null,
  provider          text        not null default 'unknown',
  model             text        not null default 'unknown',
  requests          integer     not null default 1,
  prompt_tokens     integer     not null default 0,
  completion_tokens integer     not null default 0,
  cost_usd          numeric(10, 6) not null default 0,
  failure           boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_log_user_idx
  on public.ai_usage_log (user_id, created_at desc);

-- ---------- row level security ----------
alter table public.research_analyses enable row level security;
alter table public.ai_usage_log enable row level security;

drop policy if exists "research_analyses_select_own" on public.research_analyses;
create policy "research_analyses_select_own"
  on public.research_analyses for select
  using (auth.uid() = user_id);

drop policy if exists "research_analyses_insert_own" on public.research_analyses;
create policy "research_analyses_insert_own"
  on public.research_analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "research_analyses_update_own" on public.research_analyses;
create policy "research_analyses_update_own"
  on public.research_analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_usage_log_select_own" on public.ai_usage_log;
create policy "ai_usage_log_select_own"
  on public.ai_usage_log for select
  using (auth.uid() = user_id);

drop policy if exists "ai_usage_log_insert_own" on public.ai_usage_log;
create policy "ai_usage_log_insert_own"
  on public.ai_usage_log for insert
  with check (auth.uid() = user_id);

-- No delete policies: analyses cascade-delete with their paper_job.
