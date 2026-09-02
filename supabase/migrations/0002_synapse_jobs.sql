-- ============================================================
-- BeingNeuron · Phase 4 · Migration 0002
-- Synapse intake: paper_jobs table + RLS + temporary storage
--
-- Apply with the Supabase CLI:   supabase db push
-- Or paste into:  Supabase dashboard → SQL Editor → Run
-- Depends on migration 0001 (reuses public.set_updated_at()).
-- ============================================================

-- ---------- table ----------
create table if not exists public.paper_jobs (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  source_type         text        not null check (source_type in ('pdf', 'arxiv')),
  original_filename   text,
  paper_url           text,
  arxiv_id            text,
  temporary_file_path text,
  file_size           bigint,
  status              text        not null default 'uploaded'
                      check (status in ('uploaded', 'queued', 'processing', 'completed', 'failed')),
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.paper_jobs is
  'Synapse intake jobs (Phase 4). One row per uploaded PDF or imported arXiv paper. Users may only access their own rows (RLS).';

-- ---------- indexes ----------
create index if not exists paper_jobs_user_created_idx
  on public.paper_jobs (user_id, created_at desc);

create index if not exists paper_jobs_user_status_idx
  on public.paper_jobs (user_id, status);

-- Hard server-side duplicate guard: one job per user per arXiv identifier.
create unique index if not exists paper_jobs_unique_arxiv_per_user
  on public.paper_jobs (user_id, arxiv_id)
  where arxiv_id is not null;

-- ---------- automatic timestamps (trigger from migration 0001) ----------
drop trigger if exists paper_jobs_set_updated_at on public.paper_jobs;
create trigger paper_jobs_set_updated_at
  before update on public.paper_jobs
  for each row execute procedure public.set_updated_at();

-- ---------- row level security ----------
-- Authorization is always auth.uid() — never email or client-supplied ids.
-- A user can never read, insert-as, modify, or delete another user's jobs,
-- even by guessing ids.
alter table public.paper_jobs enable row level security;

drop policy if exists "paper_jobs_select_own" on public.paper_jobs;
create policy "paper_jobs_select_own"
  on public.paper_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "paper_jobs_insert_own" on public.paper_jobs;
create policy "paper_jobs_insert_own"
  on public.paper_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "paper_jobs_update_own" on public.paper_jobs;
create policy "paper_jobs_update_own"
  on public.paper_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "paper_jobs_delete_own" on public.paper_jobs;
create policy "paper_jobs_delete_own"
  on public.paper_jobs for delete
  using (auth.uid() = user_id);

-- ---------- temporary storage bucket ----------
-- Private by default. Server-side enforcement of the size limit and MIME
-- type means oversized/non-PDF payloads are rejected by storage itself,
-- before any processing step can see them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paper-intake', 'paper-intake', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- Objects live under user-scoped prefixes: {user_id}/{uuid}-{safe-name}.
-- The leading folder must equal the caller's auth id.
drop policy if exists "intake_write_own_prefix" on storage.objects;
create policy "intake_write_own_prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'paper-intake'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "intake_read_own_prefix" on storage.objects;
create policy "intake_read_own_prefix"
  on storage.objects for select
  using (
    bucket_id = 'paper-intake'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update/delete policies for users: retention is handled by a
-- service-role worker (Phase 5) which removes originals after the
-- analysis result is saved, or after the retention window expires.
-- Deleting a job via the API best-effort removes its temp file as well.
