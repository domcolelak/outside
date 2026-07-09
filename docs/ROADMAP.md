# Roadmap & handover notes

This document is the honest boundary between what ships in this repository and what is designed but
not yet implemented. Each item lists the integration point the current code already exposes, so a
buyer or the next engineer can extend rather than rebuild.

## Priority 1 — Persistence & temporal tracking — ✅ BUILT
- **Store:** PostgreSQL via Prisma (`prisma/schema.prisma`), loaded lazily when `DATABASE_URL` is set;
  a zero-config in-memory store (`lib/persistence/memory-store.ts`) is the default so the product runs
  and demos change detection with no database. No graph DB — see ARCHITECTURE rationale.
- **Model (built):** `Target`, `Scan`, `AssetIdentity` (stable, unique on `targetId+canonical`),
  `AssetSnapshot` (per-scan). Temporal identity survives disappear→return gaps.
- **Change detection (built):** `lib/persistence/diff.ts` diffs consecutive snapshot sets into
  new / returned / disappeared / technology-changed / priority-changed events, surfaced in the
  summary panel and as `newlyObserved` flags derived from real history. Verified: a stable surface
  reports zero changes (no fabrication).
- **Remaining:** `edge_snapshot`, `finding_occurrence`, `change_event` persistence, `audit_event`,
  certificate-change detection, and a full historical graph-diff view.

## Priority 2 — Accounts, organizations, verification — ✅ BUILT
- **Auth (built):** email/password with scrypt hashing (`lib/auth/password.ts`) and HMAC-signed
  httpOnly session cookies (`lib/auth/session.ts`); `lib/auth/index.ts` resolves the session. Stores:
  in-memory default + Prisma (`User`/`Organization`/`Membership`).
- **RBAC (built):** strict hierarchy `owner > admin > analyst > viewer`, enforced server-side via
  `hasOrgRole` on every mutating route.
- **Domain verification (built):** DNS-TXT ownership proof in `lib/verify/`, `app/api/verify/`.
- **Remaining:** OAuth providers + team invites (credentials auth ships today); file-based
  (`/.well-known/outside-verify.txt`) verification fallback; bind verification to the authenticated org.

## Priority 3 — Scheduled monitoring — ✅ BUILT
- **Model (built):** `Monitor` (org, domain, daily/weekly cadence, enabled, `nextRunAt`), with
  per-plan limits enforced server-side; API in `app/api/monitors/`.
- **Runner (built):** protected cron endpoint `app/api/cron/scan` claims due monitors and runs real
  passive scans idempotently (each `nextRunAt` advances after running). Serverless-friendly — point
  Vercel Cron / any timer at it with `CRON_SECRET`. No Redis/worker required.
- **Remaining:** per-provider retry/backoff, concurrent-scan dedupe per target, stale-job reaping for
  very large fleets.

## Priority 4 — Reporting, email, alerting — ✅ BUILT
- **PDF export (built):** `@react-pdf` server render (`lib/report/`, `app/api/report/`).
- **Email (built):** provider-abstracted (`lib/email/provider.ts`) — console dev transport + Resend;
  responsive templates for welcome and change alerts.
- **Alerting (built):** `lib/email/alerts.ts` groups meaningful changes into one email per monitor and
  suppresses low-signal noise. **Remaining:** per-user notification preferences, weekly digest.

## Priority 5 — Billing (Stripe) — ✅ BUILT
- Checkout, billing portal, and a **signature-verified, idempotent** webhook syncing plan/subscription
  state (`app/api/billing/`); plan limits enforced server-side; env-guarded so the free plan works with
  no keys. **Remaining:** move webhook idempotency from in-memory to a durable `processed_events` table.

## Priority 6 — AI explanation layer — ✅ BUILT
- Provider-abstracted (`lib/ai/explainer.ts`), **read-only** over a finalized `ScanResult`; deterministic
  template default, Anthropic when `ANTHROPIC_API_KEY` is set; degrades to template on any failure.
  **Remaining:** persist AI output as a separate `AIAnalysis` record; per-finding explanations.

## Graph scale
- Current: `O(n²)` force sim, smooth into the hundreds of nodes.
- 1,000+ nodes: Barnes–Hut quadtree for repulsion, viewport culling, and level-of-detail label
  rendering. Node clustering by registrable domain / kind for very large surfaces.

## Additional providers (abstracted behind the provider interface)
Passive subdomain intelligence, HTTP observation + technology fingerprinting (with the SSRF-pinned
connector), mail-security deep checks (DKIM/DMARC), and public network-ownership (RDAP/ASN) signals.
