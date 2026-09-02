-- ============================================================
-- BeingNeuron · Phase 2 · Migration 0001
-- User profiles table + RLS + auto-provisioning trigger
--
-- Apply with the Supabase CLI:   supabase db push
-- Or paste into:  Supabase dashboard → SQL Editor → Run
-- ============================================================

-- ---------- table ----------
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  email       text        not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Users may only read/write their own row (enforced by RLS).';

create index if not exists profiles_email_idx on public.profiles (email);

-- ---------- automatic timestamps ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ---------- auto-provision a profile on signup ----------
-- Runs with elevated privileges (security definer) but is pinned
-- to a fixed search_path and only ever inserts the caller's row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- row level security ----------
-- Authorization is bound to auth.uid() (the authenticated user id),
-- never to email or any client-supplied identifier.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Insert-own exists as a safe fallback in case the trigger path
-- is bypassed (e.g. provider signups where the trigger raced).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deletion cascades from auth.users; no delete policy is granted.
