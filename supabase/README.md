# BeingNeuron · Supabase setup (Phases 2–5)

## 1. Create the project
1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` → `.env` and set:
   - `VITE_SUPABASE_URL` — Settings → API → Project URL
   - `VITE_SUPABASE_ANON_KEY` — Settings → API → `anon public` key
   - Never add the `service_role` key anywhere in this repo.

## 2. Apply migrations
Creates the `profiles` table, RLS policies, and the auto-provisioning trigger.

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*.sql
```

Or run `supabase/migrations/0001_profiles.sql` in the dashboard SQL editor.

## 3. Auth configuration
- **Email confirmation** — works either way:
  - *Enabled*: signup shows the "check your inbox" state.
  - *Disabled*: signup signs the user in and redirects to `/dashboard`.
- **Password reset redirect** — Authentication → URL Configuration → set
  `Redirect URLs` to include your app origin, e.g.
  `https://your-domain.example/#/reset-password`
  (the app uses hash routing).

## 4. Notes
- Profiles are auto-created by the `on_auth_user_created` trigger;
  the client also runs a safe `upsert` fallback for its own row only.
- All access is enforced server-side by RLS on `auth.uid()` — a user
  can never read or write another user's profile, even by guessing ids.
- Without env vars the app boots in a clearly-labelled **demo mode**
  (localStorage-only accounts) so the UI can be evaluated offline.

## 5. Synapse intake (Phase 4)
Migration `0002_synapse_jobs.sql` creates:

- `public.paper_jobs` — intake job records (`pdf` / `arxiv`), RLS locked to
  `auth.uid()`, indexes on `(user_id, created_at desc)` and `(user_id, status)`,
  and a partial unique index so one user can never import the same arXiv id twice.
- `paper-intake` storage bucket — **private**, with server-side enforcement:
  `file_size_limit = 25 MB` and `allowed_mime_types = ['application/pdf']`,
  so oversized or non-PDF payloads are rejected by storage before any
  processing step sees them.
- Storage policies pin every object to the caller's prefix
  (`{user_id}/{uuid}-{safe-name}`) — cross-user access is impossible even
  with a guessed path, and filenames are sanitized client-side so no path
  traversal can be constructed.

Uploads use **signed upload URLs** (token-scoped to one exact path) with
XHR progress; a plain `storage.upload` is the fallback.

Retention: originals are temporary by design. A service-role worker
(Phase 5, alongside the analysis engine) will delete them once results are
saved or after a retention window — no user-facing delete policy exists,
and deleting a job best-effort removes its temp file via the API.

The client validates extension, MIME, size, and the `%PDF-` header, and
applies a documented 10 jobs/hour cooldown. Server-side extraction is done
by the `extract-paper` Edge Function (below).

## 6. Extraction pipeline (Phase 5)
Migration `0003_extraction.sql` creates:

- `public.extracted_documents` — normalized output per job (title, authors,
  abstract, sections w/ page + paragraph order, captions, stats). The original
  PDF is **not** stored here — only structured text. Unique on `job_id`,
  RLS locked to `auth.uid()`.
- `public.document_chunks` — analysis-ready chunks (`front`/`body`/`references`),
  each with `order_index`, section context and `page_start`/`page_end` so later
  LLM analysis can cite exact source locations. Cascade-deletes with its document.
- `paper_jobs.document_id` → links a job to its extracted document.
- `paper_jobs.source_purged` + expanded status lifecycle:
  `uploaded → queued → extracting → normalizing → chunking → ready_for_analysis`
  (and `failed`, retryable).

### Edge Function: `extract-paper`
Server-side extraction (the production path). Deploy once:

```bash
supabase functions deploy extract-paper
```

The client calls `functions.invoke("extract-paper", { body: { job_id } })`.
The function:
1. Re-verifies the caller's JWT and job ownership (service role bypasses RLS,
   so ownership is checked explicitly — a user can never trigger extraction on
   another user's job).
2. Downloads the temp PDF from the private bucket (or fetches the arXiv PDF).
3. Extracts text with positions (pdf.js, main-thread "fake worker" in Deno),
   detects two-column layouts, strips repeated headers/footers/page numbers,
   and identifies title, authors, abstract, sections, references, captions.
4. Chunks with paragraph boundaries, section context, page spans and overlap.
5. Persists `extracted_documents` + `document_chunks`, marks the job
   `ready_for_analysis`, and **deletes the original PDF** (retention).

If the function is not deployed, the client transparently falls back to the
in-browser pipeline (`src/app/pipeline.ts`), which implements the same
heuristics — so the feature works in demo/offline mode too.

## 7. Knowledge graphs (Phase 7)
Migration `0005_knowledge_graphs.sql` creates `public.knowledge_graphs` —
nodes/edges optimized for visualization, stored **separately** from the raw
`research_analyses` output. Unique on `job_id`, RLS locked to `auth.uid()`,
cascade-deletes with its job.

- Graph generation (`src/app/graphModel.ts`) is a pure, deterministic
  function over a stored `PaperAnalysis`: it dedupes nodes, caps density,
  derives evidence-checked relationships, and computes Overview/Detailed/Full
  levels. No graph library is involved.
- Rendering (`src/app/ForceGraph.tsx`) is a dependency-free SVG force layout,
  lazy-loaded with `GraphPage` (`React.lazy`) so it never ships globally.
- The client generates + persists the graph on first view via
  `getGraph`/`saveGraph`; with Supabase configured these hit the
  `knowledge_graphs` table, in demo mode a localStorage store.
