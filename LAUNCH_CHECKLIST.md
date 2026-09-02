# BeingNeuron — Production Launch Checklist (Phase 17)

Every item maps to something implemented in this repository. "Verify" is the
concrete way to confirm it before launch.

## 1. HTTPS
- [ ] Production served over TLS only (static host + Supabase are HTTPS by default).
- **Verify:** `curl -I https://<domain>` → 200; `http://` redirects to `https://`.
  Auth tokens must never transit cleartext.

## 2. Authentication
- [ ] Supabase Auth live (`VITE_SUPABASE_URL`/`ANON_KEY` set — demo mode OFF in prod).
- [ ] Email confirmation decision made; reset redirect URLs whitelisted.
- [ ] Session restore works across refresh; expired sessions redirect to `/login` with `?next=`.
- **Verify:** sign up → refresh → still signed in; tamper with the stored token →
  guarded routes bounce to login (never a blank page; `AuthGate` covers the check).

## 3. Database security
- [ ] Migrations 0001–0012 applied; RLS enabled on **every** user table.
- [ ] No table trusts client-supplied identity — policies bind `auth.uid()` to
  the row's `user_id` (collections authorize through ownership; `subscriptions`
  is read-only for users, written only by the service role).
- **Verify:** in the SQL editor, run a `select` from another user's rows with
  `set request.jwt.claim.sub` spoofed → returns 0 rows.
  `supabase/SECURITY_AUDIT.md` documents the per-table matrix.

## 4. Storage security
- [ ] `paper-intake` bucket is **private**; policies require the object path to
  start with the caller's user id; bucket enforces 25 MB + `application/pdf`.
- [ ] Access is via short-lived signed URLs (5 min) only.
- **Verify:** request an object path under another user's folder → 403.
  Upload a renamed `.exe.pdf` with a wrong MIME → rejected by the bucket.

## 5. Environment variables
- [ ] `.env` contains only the two `VITE_` values; all server secrets set via
  `supabase secrets set` (STRIPE_*, AI_*, CORS_ORIGIN).
- [ ] No secret appears in the deployed bundle.
- **Verify:** `grep -r "sk_live\|service_role\|AI_API_KEY" dist/` → no matches.

## 6. API key protection
- [ ] AI provider key and Stripe secret exist only in Edge Function secrets.
- [ ] `analyze-paper` / `create-checkout` resolve the caller from the JWT, never
  from a client-supplied user id.
- **Verify:** call an Edge Function without a Bearer token → 401.

## 7. Error logging
- [ ] All failures surface friendly messages (`classifyPipelineError`,
  `friendlyAuthMessage`, `friendlyStorageError`); raw errors never render.
- [ ] Server-side job failures persist `error_message` on the job row with the
  job id for tracing; deletion writes a receipt row first.
- [ ] No passwords, keys, or full document text in logs.
- **Verify:** upload a corrupt PDF → message explains the problem; the failed
  job shows `failed` with a retry action, not a stack trace.

## 8. Rate limiting
- [ ] Supabase Auth rate limiting enabled for login/signup/reset.
- [ ] DB trigger `enforce_usage_quotas` enforces per-plan daily caps
  (fail-closed default of 1 for unconfigured pairs) — independent of the client.
- [ ] Duplicate analysis billing blocked by the partial unique index;
  retry loop capped (original + 2 retries).
- **Verify:** exceed the Free plan's 3 daily analyses → the insert fails with
  `QUOTA_EXCEEDED` even if the UI is bypassed.

## 9. Temporary file cleanup
- [ ] Default retention = purge-after-processing: `saveResult` deletes the PDF
  once extraction succeeds and sets `source_purged`; users can opt into
  `keep_originals` from Settings → Data & Privacy.
- [ ] Job deletion removes any still-stored object; `delete-account` wipes the
  user's whole storage folder.
- **Verify:** run a PDF end-to-end, then check the bucket — the object is gone
  while `extracted_documents` + `document_chunks` remain.

## 10. Billing webhooks
- [ ] `stripe-webhook` deployed with `STRIPE_WEBHOOK_SECRET`; signature
  verification rejects forged events (returns 400).
- [ ] `subscriptions` written only by the webhook path; test the full cycle:
  checkout → `checkout.session.completed` → plan active; failed card →
  `invoice.payment_failed` → `past_due`; cancel → `canceled` → back to Free.
- **Verify:** replay a captured webhook body with a wrong signature → 400 and
  no row change. Stripe dashboard shows green deliveries.

## 11. Backup strategy
- [ ] Supabase automated backups enabled (daily / PITR on Pro).
- [ ] One test restore to a scratch project performed.
- [ ] PDFs confirmed ephemeral (their loss is never data loss); billing
  reconstructible from Stripe.
- **Verify:** restore yesterday's snapshot to a scratch project and read one
  `research_analyses` row.

---

## Final smoke test (both user flows)

**Research flow:** visitor → home → pricing → signup → dashboard → upload PDF →
intake validates with progress → extraction stages → analysis → open workspace →
graph (zoom/search/filter/levels) → node evidence excerpts with page + section →
save to library → select 2 papers → multi-paper graph with per-paper attribution
and labelled hypotheses.

**Learning flow:** user → NeuroSurgery hub (surgical record) → start Overfitting →
observe diverging vitals → record a diagnosis → intervene (dropout/regularization) →
retrain → verdict computed from measured criteria → progress persists after refresh.

Both flows are reachable from a fresh browser with only the two `VITE_` variables set.
