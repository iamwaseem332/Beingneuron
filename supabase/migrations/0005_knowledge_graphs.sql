-- ============================================================
-- BeingNeuron · Phase 7 · Migration 0005
-- Knowledge graphs — visualization-optimized nodes/edges,
-- stored SEPARATELY from the raw AI research analysis.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0002_synapse_jobs.sql (paper_jobs)
-- ============================================================

create table if not exists public.knowledge_graphs (
  id           uuid        primary key default gen_random_uuid(),
  job_id       uuid        not null references public.paper_jobs (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  paper_title  text        not null default '',
  -- [{ id, type, label, short_description, detailed_explanation,
  --    evidence_references[], confidence, importance, uncertain, metadata }]
  nodes        jsonb       not null default '[]'::jsonb,
  -- [{ id, source, target, kind, evidence[], confidence, uncertain }]
  edges        jsonb       not null default '[]'::jsonb,
  -- { node_count, edge_count, levels{overview,detailed,full}, dropped_relations, generator }
  stats        jsonb       not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint knowledge_graphs_job_id_key unique (job_id)
);

create index if not exists knowledge_graphs_user_idx
  on public.knowledge_graphs (user_id, created_at desc);

drop trigger if exists knowledge_graphs_set_updated_at on public.knowledge_graphs;
create trigger knowledge_graphs_set_updated_at
  before update on public.knowledge_graphs
  for each row execute procedure public.set_updated_at();

-- ---------- row level security ----------
-- A user can only ever read or write graphs they own. The nodes/edges are
-- derived from their own analysis; no cross-user access path exists.
alter table public.knowledge_graphs enable row level security;

drop policy if exists "knowledge_graphs_select_own" on public.knowledge_graphs;
create policy "knowledge_graphs_select_own"
  on public.knowledge_graphs for select
  using (auth.uid() = user_id);

drop policy if exists "knowledge_graphs_insert_own" on public.knowledge_graphs;
create policy "knowledge_graphs_insert_own"
  on public.knowledge_graphs for insert
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_graphs_update_own" on public.knowledge_graphs;
create policy "knowledge_graphs_update_own"
  on public.knowledge_graphs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_graphs_delete_own" on public.knowledge_graphs;
create policy "knowledge_graphs_delete_own"
  on public.knowledge_graphs for delete
  using (auth.uid() = user_id);
