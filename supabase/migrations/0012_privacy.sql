-- ============================================================
-- BeingNeuron · Phase 15 · Migration 0012
-- Data responsibility: configurable PDF retention + a durable
-- record of account-deletion requests.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0001_profiles.sql
-- ============================================================

-- ---------- retention policy ----------
-- Per-user choice for what happens to the original PDF after the
-- extraction pipeline has stored the structured data.
--   purge_after_processing (default): original deleted once structured
--     data is saved — the pipeline keeps text + chunks, not the file.
--   keep_originals: the temporary file is retained and re-attachable.
alter table public.profiles
  add column if not exists retention_policy text not null default 'purge_after_processing'
  check (retention_policy in ('purge_after_processing', 'keep_originals'));

-- The profiles update policy (0001) already restricts writes to the
-- owning user, so the retention choice cannot be changed by anyone else.

-- ---------- account deletion requests ----------
-- `delete-account` (Edge Function, service role) performs the actual
-- deletion synchronously; this table is a durable receipt so a failed or
-- interrupted deletion is never silent.
create table if not exists public.account_deletion_requests (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  status     text        not null default 'requested'
             check (status in ('requested', 'completed', 'failed')),
  detail     text        not null default '',
  created_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

-- A user can insert a request for themselves and read their own receipts.
drop policy if exists "deletion_requests_insert_own" on public.account_deletion_requests;
create policy "deletion_requests_insert_own"
  on public.account_deletion_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "deletion_requests_select_own" on public.account_deletion_requests;
create policy "deletion_requests_select_own"
  on public.account_deletion_requests for select
  using (auth.uid() = user_id);
