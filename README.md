# BeingNeuron

**AI Research & Learning Platform** — understand research, explore ideas, experiment with AI.

BeingNeuron is two instruments in one workspace:

- **Synapse** — domain-agnostic research-paper intelligence. Upload a PDF or
  import an arXiv paper; it is extracted, normalized, chunked, analyzed, and
  rendered as an interactive, **evidence-backed** knowledge graph with
  multi-paper comparison.
- **NeuroSurgery** — a hands-on machine-learning lab. Seven challenge
  scenarios (overfitting, dead ReLUs, vanishing/exploding gradients, …) run
  **real** small neural networks in your browser — every metric is computed,
  never simulated.

Built with React + TypeScript + Vite + Tailwind, on Supabase (Auth, Postgres,
Storage, Edge Functions) with Stripe billing.

## Quick start (zero configuration)

```bash
npm install
npm run dev
```

Without Supabase credentials the app boots in a clearly-labelled **demo mode**
(browser-local accounts and data) so every flow — signup, intake, extraction,
analysis, graph workspace, surgery lab, billing UI — is fully testable offline.

## Production

1. Copy `.env.example` → `.env`, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
2. Apply migrations: `supabase db push` (0001–0012).
3. Deploy the seven Edge Functions and set server secrets (Stripe, AI provider).
4. `npm run build` → deploy `dist/` to any static host with an SPA fallback.

Full instructions: **[DEPLOYMENT.md](DEPLOYMENT.md)** · pre-launch verification:
**[LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)** · authorization matrix:
**[supabase/SECURITY_AUDIT.md](supabase/SECURITY_AUDIT.md)**.

## Repository map

```
src/            Phase 1 public site + design system (flat)
src/auth/       Phase 2 authentication (Supabase + demo adapters)
src/app/        Phases 3–13 workspace: intake, pipelines, graph, lab, usage
src/billing/    Phase 14 centralized plan configuration
supabase/       migrations (0001–0012) + Edge Functions + security audit
public/         robots.txt · sitemap.xml · og.svg
```

## Phase ledger

01 foundation · 02 auth · 03 workspace shell · 04 intake · 05 extraction ·
06 evidence-backed analysis · 07 knowledge graphs · 08 research workspace ·
09 library & multi-paper · 10 NeuroSurgery engine · 11 challenges & progress ·
12 Synapse→NeuroSurgery bridge · 13 usage metering · 14 Stripe billing ·
15 privacy & data controls · 16 reliability · 17 deployment & launch
