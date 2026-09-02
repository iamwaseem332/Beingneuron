-- ============================================================
-- BeingNeuron · Phase 14 · Migration 0011
-- Billing & subscriptions: plan config tables, the subscriptions
-- record (webhook-owned), billing event ledger, plan-aware quota
-- enforcement and feature gates.
--
-- SECURITY MODEL
--   * `subscriptions` is written ONLY by the service role (the
--     validated Stripe webhook). Users get a SELECT-own policy and
--     nothing else — client code can never grant itself a plan.
--   * The quota trigger resolves the caller's plan from
--     `subscriptions` and the caps from `plan_limits`, so limits are
--     enforced in the database regardless of any client tampering.
--   * `billing_events` is an append-only, webhook/service-written
--     ledger; users can only read their own rows.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0010_usage.sql
-- ============================================================

-- ---------- plan configuration (must mirror src/billing/plans.ts) ----------

create table if not exists public.plan_limits (
  plan_id     text    not null,
  kind        text    not null,
  daily_limit integer not null check (daily_limit >= 0),
  primary key (plan_id, kind)
);

create table if not exists public.plan_features (
  plan_id text    not null,
  feature text    not null,
  enabled boolean not null default false,
  primary key (plan_id, feature)
);

-- Seed to match src/billing/plans.ts exactly.
insert into public.plan_limits (plan_id, kind, daily_limit) values
  ('free',       'paper_upload',      5),
  ('free',       'paper_analysis',    3),
  ('free',       'ai_request',        60),
  ('free',       'nsg_run',           25),
  ('free',       'collection_create', 1),
  ('researcher', 'paper_upload',      40),
  ('researcher', 'paper_analysis',    25),
  ('researcher', 'ai_request',        250),
  ('researcher', 'nsg_run',           100),
  ('researcher', 'collection_create', 10),
  ('pro',        'paper_upload',      60),
  ('pro',        'paper_analysis',    60),
  ('pro',        'ai_request',        400),
  ('pro',        'nsg_run',           200),
  ('pro',        'collection_create', 20)
on conflict (plan_id, kind) do update set daily_limit = excluded.daily_limit;

insert into public.plan_features (plan_id, feature, enabled) values
  ('free',       'collections',  false),
  ('free',       'multi_paper',  false),
  ('free',       'advanced_nsg', false),
  ('researcher', 'collections',  true),
  ('researcher', 'multi_paper',  false),
  ('researcher', 'advanced_nsg', false),
  ('pro',        'collections',  true),
  ('pro',        'multi_paper',  true),
  ('pro',        'advanced_nsg', true)
on conflict (plan_id, feature) do update set enabled = excluded.enabled;

-- plan_limits / plan_features are global reference data: everyone can read,
-- nobody (except service role) can write.
alter table public.plan_limits   enable row level security;
alter table public.plan_features enable row level security;

drop policy if exists "plan_limits_read" on public.plan_limits;
create policy "plan_limits_read" on public.plan_limits for select using (true);
drop policy if exists "plan_features_read" on public.plan_features;
create policy "plan_features_read" on public.plan_features for select using (true);

-- ---------- subscriptions (webhook-owned) ----------

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_id                text    not null default 'free',
  -- active · trialing · past_due · canceled · incomplete
  status                 text    not null default 'active',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Users may ONLY read their own row. There are deliberately no
-- insert/update/delete policies: the row is maintained exclusively by the
-- service role in response to validated Stripe webhooks.
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ---------- billing event ledger ----------

create table if not exists public.billing_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, created_at desc);

alter table public.billing_events enable row level security;

drop policy if exists "billing_events_select_own" on public.billing_events;
create policy "billing_events_select_own"
  on public.billing_events for select
  using (auth.uid() = user_id);

-- ---------- plan-aware quota enforcement (replaces Phase 13 trigger) ----------

create or replace function public.resolve_plan(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plan text;
begin
  select plan_id into v_plan
  from public.subscriptions
  where user_id = p_user
    and status in ('active', 'trialing', 'past_due');
  return coalesce(v_plan, 'free');
end
$$;

create or replace function public.enforce_usage_quotas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_limit integer;
  v_used  integer;
begin
  v_plan := public.resolve_plan(new.user_id);

  select daily_limit into v_limit
  from public.plan_limits
  where plan_id = v_plan and kind = new.kind;
  -- fail closed: an unconfigured (plan, kind) gets a strict default
  v_limit := coalesce(v_limit, 1);

  if new.kind = 'ai_request' then
    select coalesce(sum(quantity), 0) into v_used
    from public.usage_events
    where user_id = new.user_id and kind = new.kind
      and created_at >= date_trunc('day', now());
    if v_used + new.quantity > v_limit then
      raise exception 'QUOTA_EXCEEDED:%: plan % daily limit of % reached', new.kind, v_plan, v_limit;
    end if;
  else
    select count(*) into v_used
    from public.usage_events
    where user_id = new.user_id and kind = new.kind
      and created_at >= date_trunc('day', now());
    if v_used + 1 > v_limit then
      raise exception 'QUOTA_EXCEEDED:%: plan % daily limit of % reached', new.kind, v_plan, v_limit;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists usage_events_enforce_quotas on public.usage_events;
create trigger usage_events_enforce_quotas
  before insert on public.usage_events
  for each row execute procedure public.enforce_usage_quotas();

-- ---------- feature gates (server-side) ----------

create or replace function public.require_feature(p_feature text)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plan    text;
  v_enabled boolean;
begin
  v_plan := public.resolve_plan(auth.uid());
  select enabled into v_enabled
  from public.plan_features
  where plan_id = v_plan and feature = p_feature;

  if coalesce(v_enabled, false) = false then
    raise exception 'FEATURE_RESTRICTED:%: not available on plan %', p_feature, v_plan;
  end if;
end
$$;

-- Collections require the `collections` feature (Researcher+).
create or replace function public.enforce_collection_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_feature('collections');
  return new;
end
$$;

drop trigger if exists research_collections_require_feature on public.research_collections;
create trigger research_collections_require_feature
  before insert on public.research_collections
  for each row execute procedure public.enforce_collection_feature();
