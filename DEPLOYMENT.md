# BeingNeuron — Deployment Architecture (Phase 17)

## 1. Hosting assessment

This repository builds to a **pure static bundle** (`npm run build` → `dist/`):

- React SPA, no Node server, no server-rendered routes.
- The only runtime dependencies outside the bundle are **Supabase**
  (Auth, Postgres, Storage, Edge Functions) and **Stripe**.
- Shared/LAMP-style hosting is **not** suitable for the data plane — but it
  doesn't need to be: nothing in this app requires PHP/MySQL/long-running
  workers. Everything server-side is covered by Supabase's managed services.

Conclusion: **static CDN for the frontend + Supabase for everything stateful.**
No servers to patch, no worker fleet to run.

## 2. Architecture

```
                        ┌─────────────────────────────────────────────┐
   Browser (SPA)        │               SUPABASE (managed)            │
 ┌──────────────┐       │ ┌───────────┐ ┌────────────┐ ┌───────────┐ │
 │ dist/ static │◄─────►│ │ Auth      │ │ Postgres   │ │ Storage   │ │
 │ any CDN +    │  JWT  │ │ (users,   │ │ RLS on all │ │ private   │ │
 │ SPA fallback │       │ │ sessions) │ │ 15 tables  │ │ paper-    │ │
 └──────┬───────┘       │ └───────────┘ └────────────┘ │ intake    │ │
        │               │ ┌────────────────────────┐   └───────────┘ │
        │  invoke()     │ │ Edge Functions (jobs)  │                 │
        └──────────────►│ │ extract-paper          │──► Stripe API   │
                        │ │ analyze-paper ─► AI API│──► OpenAI etc.  │
   Stripe checkout ◄────│ │ create-checkout        │                 │
   (hosted page)        │ │ billing-portal         │                 │
                        │ │ stripe-webhook ──writes─► subscriptions  │
   Stripe webhook ─────►│ │ change-plan            │                 │
                        │ │ delete-account         │                 │
                        │ └────────────────────────┘                 │
                        └─────────────────────────────────────────────┘
```

| Workload            | Runs on                         | Notes                                            |
| ------------------- | ------------------------------- | ------------------------------------------------ |
| Frontend            | Any static host (Vercel/Netlify/Cloudflare Pages/S3) | SPA fallback to `index.html` required |
| Database            | Supabase Postgres               | Migrations 0001–0012, RLS everywhere             |
| Auth                | Supabase Auth                   | Email + optional OAuth later                     |
| Temporary PDFs      | Supabase Storage `paper-intake` | Private bucket, 25 MB + PDF-MIME enforced, retention purge after extraction |
| Background jobs     | Supabase Edge Functions         | Serverless; job status persisted in `paper_jobs` |
| Payment UI          | Stripe Checkout (hosted)        | No card data ever touches our code               |
| Billing state       | `subscriptions` table           | Written only by the validated webhook            |
| AI analysis         | `analyze-paper` → provider API  | Key server-side only; structured output + validation |

### Why no separate worker/queue service
Expensive processing (extraction, analysis) runs in Edge Functions invoked
per job, with **status persisted in the database at every stage**
(`queued → extracting → … → analyzed`). An interrupted run is detectable and
re-runnable from the UI; the Phase 16 retry/idempotency guards prevent
duplicate processing and duplicate billing. If volume later outgrows
function timeouts, the natural upgrade is Supabase queue workers (pgmq) —
the job-status contract doesn't change.

## 3. Step-by-step production deploy

### 3.1 Supabase project
1. Create a project; copy `.env.example` → `.env`; set `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY`.
2. Apply all migrations in order:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # 0001 profiles … 0012 privacy
   ```
   Migration 0002 also creates the private `paper-intake` bucket with
   25 MB limit and `application/pdf` MIME allowlist.
3. Auth settings:
   - Redirect URLs: add `https://<your-domain>/#/login` and
     `https://<your-domain>/#/reset-password`.
   - Email confirmation: on (signup shows the verify state) or off
     (auto sign-in) — both paths are handled.
   - Enable built-in rate limiting for login/signup/reset (Security → Auth).

### 3.2 Edge Functions
```bash
supabase functions deploy extract-paper analyze-paper \
  create-checkout billing-portal change-plan stripe-webhook delete-account

supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_RESEARCHER=price_... \
  STRIPE_PRICE_PRO=price_... \
  AI_PROVIDER=openai AI_MODEL=gpt-4o-mini AI_API_KEY=sk-... \
  CORS_ORIGIN=https://<your-domain>
```

### 3.3 Stripe
1. Products/prices: Researcher + Pro (recurring). Copy the Price IDs into secrets.
2. Webhook endpoint: `https://<ref>.functions.supabase.co/stripe-webhook`,
   events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
   Paste the signing secret into `STRIPE_WEBHOOK_SECRET`.

### 3.4 Frontend
```bash
npm ci && npm run build     # → dist/
```
Deploy `dist/` to any static host with **SPA fallback** (all non-file requests
→ `index.html`). HTTPS is mandatory (auth cookies/tokens require it).

## 4. SEO & routing note (read before launch)

The app uses `HashRouter` (`/#/pricing`) because the current preview host
serves `dist/index.html` directly without rewrite support. Consequences:

- Crawlers see one document; per-route indexing of the public site is limited.
- Private screens are still protected from indexing at runtime: `RouteMeta`
  emits `<meta name="robots" content="noindex,nofollow">` on every
  authenticated/auth route, and `robots.txt` documents the policy.

**Migration plan when the host supports rewrites:** swap `HashRouter` for
`BrowserRouter` in `src/App.tsx` (one-line change), add the host's SPA
fallback rule, update `public/sitemap.xml` to clean URLs, and set real
`og:url`/canonical values in `index.html` + `src/RouteMeta.tsx`.

`public/og.svg` is the social card; export a 1200×630 PNG version at launch
and update the `og:image` tag for maximum crawler compatibility.

## 5. Cost-sensitive components

| Component            | Driver                              | Control in place                          |
| -------------------- | ----------------------------------- | ----------------------------------------- |
| AI analysis          | Tokens per paper (chunked)          | Daily per-plan caps (DB trigger), token logging in `ai_usage_log` |
| Edge Function invocations | Runs per paper + retries       | Idempotency guards; retry cap of 2        |
| Storage              | Transient — PDFs purged after extraction | Retention policy, 25 MB/file cap     |
| Stripe               | % per successful charge             | Webhook-only subscription writes          |
| Supabase egress      | Signed-URL downloads of temp PDFs   | Short-lived URLs (5 min)                  |

## 6. Monitoring recommendations

- **Supabase dashboard**: auth signups, DB errors, function failures, storage growth.
- **`ai_usage_log` + `usage_events`**: weekly rollup of tokens/cost per user
  (the `Usage` page already renders these per user).
- **`billing_events`**: alert on `payment_failed` and `canceled` spikes.
- **Error tracking** (e.g. Sentry) for the SPA — wire to the global handler;
  the app already surfaces friendly messages and never logs credentials.
- **Stripe dashboard**: failed webhooks (Stripe retries automatically).

## 7. Backup strategy

- **Supabase automated backups** (Pro plan: daily, 7-day PITR) cover all 15
  tables including `subscriptions`, analyses, and graphs.
- PDFs are ephemeral by design (purged after extraction), so their loss is
  never a data-loss event — the extracted structure is the durable artifact.
- Stripe is the system of record for billing; `subscriptions` can be rebuilt
  from Stripe's API if ever needed.
- Recommended pre-launch: enable point-in-time recovery and run one test
  restore to a scratch project.
