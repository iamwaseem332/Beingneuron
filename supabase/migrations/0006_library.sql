-- ============================================================
-- BeingNeuron · Phase 9 · Migration 0006
-- Research library: per-job denormalized stats, collections,
-- collection membership. All access is user-scoped via RLS.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0002_synapse_jobs, 0003_extraction, 0005_knowledge_graphs
-- ============================================================

-- ---------- library stats (denormalized for fast listing) ----------
-- Written by the client when analysis / graph generation succeeds.
-- Keeping them on the job row means the library is a single indexed
-- query instead of fanning out across three tables.
alter table public.paper_jobs
  add column if not exists analysis_stats jsonb,
  add column if not exists graph_stats    jsonb;

-- ---------- research collections ----------
create table if not exists public.research_collections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 120),
  description text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists research_collections_user_idx
  on public.research_collections (user_id, created_at desc);

drop trigger if exists research_collections_set_updated_at on public.research_collections;
create trigger research_collections_set_updated_at
  before update on public.research_collections
  for each row execute procedure public.set_updated_at();

-- ---------- membership ----------
create table if not exists public.collection_members (
  collection_id uuid        not null references public.research_collections (id) on delete cascade,
  job_id        uuid        not null references public.paper_jobs (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, job_id)
);

create index if not exists collection_members_job_idx
  on public.collection_members (job_id);

-- ---------- row level security ----------
alter table public.research_collections enable row level security;
alter table public.collection_members enable row level security;

drop policy if exists "collections_select_own" on public.research_collections;
create policy "collections_select_own"
  on public.research_collections for select
  using (auth.uid() = user_id);

drop policy if exists "collections_insert_own" on public.research_collections;
create policy "collections_insert_own"
  on public.research_collections for insert
  with check (auth.uid() = user_id);

drop policy if exists "collections_update_own" on public.research_collections;
create policy "collections_update_own"
  on public.research_collections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "collections_delete_own" on public.research_collections;
create policy "collections_delete_own"
  on public.research_collections for delete
  using (auth.uid() = user_id);

-- Membership is authorized through collection ownership: a user can only
-- touch members of collections they own.
drop policy if exists "members_select_own" on public.collection_members;
create policy "members_select_own"
  on public.collection_members for select
  using (exists (
    select 1 from public.research_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  ));

drop policy if exists "members_insert_own" on public.collection_members;
create policy "members_insert_own"
  on public.collection_members for insert
  with check (exists (
    select 1 from public.research_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  ));

drop policy if exists "members_delete_own" on public.collection_members;
create policy "members_delete_own"
  on public.collection_members for delete
  using (exists (
    select 1 from public.research_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  ));
