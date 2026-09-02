-- ============================================================
-- BeingNeuron · Phase 5 · Migration 0003
-- Document extraction: pipeline statuses, extracted_documents,
-- document_chunks, retention columns.
--
-- Apply with:  supabase db push   (or run in the SQL editor)
-- Depends on:  0001_profiles.sql, 0002_synapse_jobs.sql
-- ============================================================

-- ---------- expanded job lifecycle ----------
-- uploaded → queued → extracting → normalizing → chunking
--          → ready_for_analysis → (Phase 6) → completed
-- failed is terminal and retryable.
alter table public.paper_jobs
  drop constraint if exists paper_jobs_status_check;

alter table public.paper_jobs
  add constraint paper_jobs_status_check
  check (status in (
    'uploaded', 'queued',
    'extracting', 'normalizing', 'chunking',
    'ready_for_analysis',
    'processing', 'completed',   -- legacy, kept for compatibility
    'failed'
  ));

-- retention: once extraction succeeds the original PDF is deleted
alter table public.paper_jobs
  add column if not exists source_purged boolean not null default false;

-- ---------- extracted documents ----------
-- Normalized, machine-processable output of the extraction pipeline.
-- The original PDF is NOT stored here — only structured text.
create table if not exists public.extracted_documents (
  id          uuid        primary key default gen_random_uuid(),
  job_id      uuid        not null references public.paper_jobs (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text        not null default '',
  authors     jsonb       not null default '[]'::jsonb,
  abstract    text        not null default '',
  page_count  integer     not null default 0,
  word_count  integer     not null default 0,
  char_count  integer     not null default 0,
  -- [{heading, page, order, paragraphs[], is_references}]
  sections    jsonb       not null default '[]'::jsonb,
  -- [{text, page, kind}]
  captions    jsonb       not null default '[]'::jsonb,
  -- {two_column_pages, removed_headers_footers, removed_page_numbers,
  --  raw_segment_count, truncated, references_count, chunk_count}
  stats       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint extracted_documents_job_id_key unique (job_id)
);

create index if not exists extracted_documents_user_idx
  on public.extracted_documents (user_id, created_at desc);

drop trigger if exists extracted_documents_set_updated_at on public.extracted_documents;
create trigger extracted_documents_set_updated_at
  before update on public.extracted_documents
  for each row execute procedure public.set_updated_at();

-- link jobs → documents (added after the table exists to avoid a cycle)
alter table public.paper_jobs
  add column if not exists document_id uuid
  references public.extracted_documents (id) on delete set null;

create index if not exists paper_jobs_document_idx
  on public.paper_jobs (document_id);

-- ---------- document chunks ----------
-- Analysis-ready chunks. Each keeps document order, section context and
-- page spans so later LLM analysis can cite exact source locations.
create table if not exists public.document_chunks (
  id           uuid        primary key default gen_random_uuid(),
  document_id  uuid        not null references public.extracted_documents (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  order_index  integer     not null,
  section      text        not null default '',
  kind         text        not null default 'body'
               check (kind in ('front', 'body', 'references')),
  page_start   integer,
  page_end     integer,
  text         text        not null,
  char_count   integer     not null default 0,
  created_at   timestamptz not null default now(),
  constraint document_chunks_order_key unique (document_id, order_index)
);

create index if not exists document_chunks_doc_idx
  on public.document_chunks (document_id, order_index);
create index if not exists document_chunks_user_idx
  on public.document_chunks (user_id);

-- ---------- row level security ----------
alter table public.extracted_documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "extracted_documents_select_own" on public.extracted_documents;
create policy "extracted_documents_select_own"
  on public.extracted_documents for select
  using (auth.uid() = user_id);

drop policy if exists "extracted_documents_insert_own" on public.extracted_documents;
create policy "extracted_documents_insert_own"
  on public.extracted_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "extracted_documents_update_own" on public.extracted_documents;
create policy "extracted_documents_update_own"
  on public.extracted_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "document_chunks_select_own" on public.document_chunks;
create policy "document_chunks_select_own"
  on public.document_chunks for select
  using (auth.uid() = user_id);

drop policy if exists "document_chunks_insert_own" on public.document_chunks;
create policy "document_chunks_insert_own"
  on public.document_chunks for insert
  with check (auth.uid() = user_id);

-- No delete policies: chunks and documents are removed only via cascade
-- when the owning paper_job is deleted (see 0002 job delete policy).
