-- ============================================================
-- BeingNeuron · Phase 11 · Migration 0008
-- NeuroSurgery challenge progress. One row per
-- (user, scenario, difficulty). Users may only access their own.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- ============================================================

create table if not exists public.nsg_progress (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  scenario_id   text        not null,
  difficulty    text        not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  attempts      integer     not null default 0,
  completed     boolean     not null default false,
  completed_at  timestamptz,
  best_val_acc  double precision,
  best_val_loss double precision,
  best_steps    integer,
  -- [{ at, suspect, matched }] — working diagnoses recorded for learning
  diagnoses     jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, scenario_id, difficulty)
);

create index if not exists nsg_progress_user_idx
  on public.nsg_progress (user_id, updated_at desc);

drop trigger if exists nsg_progress_set_updated_at on public.nsg_progress;
create trigger nsg_progress_set_updated_at
  before update on public.nsg_progress
  for each row execute procedure public.set_updated_at();

-- ---------- row level security ----------
alter table public.nsg_progress enable row level security;

drop policy if exists "nsg_progress_select_own" on public.nsg_progress;
create policy "nsg_progress_select_own"
  on public.nsg_progress for select
  using (auth.uid() = user_id);

drop policy if exists "nsg_progress_insert_own" on public.nsg_progress;
create policy "nsg_progress_insert_own"
  on public.nsg_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "nsg_progress_update_own" on public.nsg_progress;
create policy "nsg_progress_update_own"
  on public.nsg_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: progress is durable; a full account teardown cascades
-- from auth.users via the foreign key.
