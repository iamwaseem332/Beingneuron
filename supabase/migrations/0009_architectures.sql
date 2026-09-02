-- ============================================================
-- BeingNeuron · Phase 12 · Migration 0009
-- Paper architecture extraction results. Stored separately from
-- the raw analysis so the paper-defined description and any
-- derived educational representation never get confused.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0002_synapse_jobs
-- ============================================================

create table if not exists public.paper_architectures (
  id            uuid        primary key default gen_random_uuid(),
  job_id        uuid        not null references public.paper_jobs (id) on delete cascade,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  -- 0–1 · how strongly the paper is AI/ML-related
  ai_relevance  numeric(4,2) not null default 0,
  ai_topics     jsonb       not null default '[]'::jsonb,
  -- detailed · partial · insufficient · none
  sufficiency   text        not null default 'none'
                check (sufficiency in ('detailed', 'partial', 'insufficient', 'none')),
  -- paper-defined components, each with evidence references
  components    jsonb       not null default '[]'::jsonb,
  training      jsonb       not null default '{}'::jsonb,
  numeric_hints jsonb       not null default '[]'::jsonb,
  summary       text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint paper_architectures_job_id_key unique (job_id)
);

create index if not exists paper_architectures_user_idx
  on public.paper_architectures (user_id);

drop trigger if exists paper_architectures_set_updated_at on public.paper_architectures;
create trigger paper_architectures_set_updated_at
  before update on public.paper_architectures
  for each row execute procedure public.set_updated_at();

-- ---------- row level security ----------
alter table public.paper_architectures enable row level security;

drop policy if exists "paper_architectures_select_own" on public.paper_architectures;
create policy "paper_architectures_select_own"
  on public.paper_architectures for select
  using (auth.uid() = user_id);

drop policy if exists "paper_architectures_insert_own" on public.paper_architectures;
create policy "paper_architectures_insert_own"
  on public.paper_architectures for insert
  with check (auth.uid() = user_id);

drop policy if exists "paper_architectures_update_own" on public.paper_architectures;
create policy "paper_architectures_update_own"
  on public.paper_architectures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
