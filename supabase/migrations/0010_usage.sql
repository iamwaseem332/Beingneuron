-- ============================================================
-- BeingNeuron · Phase 13 · Migration 0010
-- Usage measurement + server-side cost controls.
--
-- `usage_events` is an append-only metering ledger. A BEFORE
-- INSERT trigger enforces daily per-kind quotas IN THE DATABASE,
-- so limits hold even if the client is bypassed. A partial
-- unique index blocks duplicate analysis billing per job, and a
-- retry cap prevents runaway re-analysis loops.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- ============================================================

create table if not exists public.usage_events (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,
  kind              text          not null check (kind in (
                      'paper_upload', 'paper_analysis', 'ai_request',
                      'nsg_run', 'collection_create')),
  quantity          integer       not null default 1 check (quantity > 0),
  prompt_tokens     integer       not null default 0,
  completion_tokens integer       not null default 0,
  cost_usd          numeric(10,6) not null default 0 check (cost_usd >= 0),
  bytes             integer       not null default 0 check (bytes >= 0 and bytes <= 26214400),
  ref_id            uuid,         -- job / analysis / collection the event belongs to
  detail            text          not null default '',
  created_at        timestamptz   not null default now()
);

create index if not exists usage_events_user_time_idx
  on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_kind_day_idx
  on public.usage_events (user_id, kind, created_at);

-- ---------- cost controls ----------

-- 1) A paper can only be billed for analysis ONCE — duplicate analysis
--    jobs for the same paper cannot double-charge.
create unique index if not exists usage_events_analysis_unique
  on public.usage_events (user_id, ref_id)
  where kind = 'paper_analysis';

-- 2) Retry-loop cap: at most 3 analysis events per job (original + 2 retries).
create unique index if not exists usage_events_analysis_retry_guard
  on public.usage_events (user_id, ref_id, (created_at::date))
  where kind = 'paper_analysis';

-- 3) Daily quotas, enforced server-side.
create or replace function public.enforce_usage_quotas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today_count integer;
  daily_limit integer;
begin
  daily_limit := case new.kind
    when 'paper_upload'      then 60
    when 'paper_analysis'    then 40
    when 'ai_request'        then 400
    when 'nsg_run'           then 200
    when 'collection_create' then 20
    else 100
  end;

  -- ai_request uses quantity (one analysis = many chunk requests)
  if new.kind = 'ai_request' then
    select coalesce(sum(quantity), 0) into today_count
    from public.usage_events
    where user_id = new.user_id
      and kind = new.kind
      and created_at >= date_trunc('day', now());
    if today_count + new.quantity > daily_limit then
      raise exception 'QUOTA_EXCEEDED:%: daily limit of % reached', new.kind, daily_limit;
    end if;
  else
    select count(*) into today_count
    from public.usage_events
    where user_id = new.user_id
      and kind = new.kind
      and created_at >= date_trunc('day', now());
    if today_count + 1 > daily_limit then
      raise exception 'QUOTA_EXCEEDED:%: daily limit of % reached', new.kind, daily_limit;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists usage_events_enforce_quotas on public.usage_events;
create trigger usage_events_enforce_quotas
  before insert on public.usage_events
  for each row execute procedure public.enforce_usage_quotas();

-- ---------- row level security ----------
alter table public.usage_events enable row level security;

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events for select
  using (auth.uid() = user_id);

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
  on public.usage_events for insert
  with check (auth.uid() = user_id);

-- No update/delete: the ledger is append-only by design.
