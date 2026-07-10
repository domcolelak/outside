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
- **Domain verification (built):** DNS-TXT **and** file-based (`/.well-known/outside-verify.txt`,
  SSRF-guarded) ownership proof in `lib/verify/`, `app/api/verify/`.
- **OAuth (built, env-gated):** Google OpenID Connect in `lib/auth/oauth.ts` +
  `app/api/auth/oauth/google/*`; the login button appears only when `GOOGLE_CLIENT_ID` is set. Not
  live-tested here (needs Google credentials).
- **Team invites (built):** admin+ invite teammates by email with a role (owners may grant admin);
  invite email + accept flow (`/invite/[token]`, `app/api/invites/*`).
- **Verification → org (built):** verification binds to the caller's organization on first
  authenticated start (`DomainVerification.orgId`).

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
- **Alerting (built):** `lib/email/alerts.ts` groups meaningful changes into one email per monitor,
  suppresses low-signal noise, and respects each member's **per-user notification preference**
  (`Membership.notifyChanges`, toggle in the account UI). **Remaining:** weekly digest.

## Priority 5 — Billing (Stripe) — ✅ BUILT
- Checkout, billing portal, and a **signature-verified, idempotent** webhook syncing plan/subscription
  state (`app/api/billing/`); plan limits enforced server-side; env-guarded so the free plan works with
  no keys. Webhook idempotency is **durable** via a `ProcessedEvent` table when a DB is configured
  (`lib/billing/idempotency.ts`), in-memory otherwise. **Remaining:** proration UI polish.

## Priority 6 — AI explanation layer — ✅ BUILT
- Provider-abstracted (`lib/ai/explainer.ts`), **read-only** over a finalized `ScanResult`; deterministic
  template default, Anthropic when `ANTHROPIC_API_KEY` is set; degrades to template on any failure.
  Executive summaries **and** per-finding plain-English explanations are built, and AI output is
  persisted as a separate `AIAnalysis` record (`lib/ai/persist.ts`) when a DB is configured — kept
  apart from deterministic scan data.

## Graph scale — ✅ BUILT (Barnes–Hut)
- Direct `O(n²)` force sim for small graphs; **Barnes–Hut quadtree** (`lib/graph/barnesHut.ts`,
  ~O(n log n)) kicks in above 140 nodes. Auto-fit already provides viewport framing.
- **Remaining for 10k+ nodes:** viewport culling, level-of-detail labels, and node clustering by
  registrable domain / kind.

## Change detection — certificate changes ✅ BUILT
- `AssetSnapshot.certKey` + a `certificate_changed` change type (`lib/persistence/diff.ts`); surfaced
  in the change panel and alerted on. Passive cert-fingerprint capture per host is the provider
  enhancement that will populate `certKey` for real scans.

## History / graph-diff — ✅ BUILT (baseline)
- `app/api/history` + an exposure-score timeline sparkline (`components/panels/HistoryPanel.tsx`) over
  a target's persisted scans; the graph already overlays NEW/RETURNED nodes per scan.
- **Remaining:** a full side-by-side two-scan graph diff view.

## Additional providers (abstracted behind the provider interface)
Passive subdomain intelligence, HTTP observation + technology fingerprinting (with the SSRF-pinned
connector), mail-security deep checks (DKIM/DMARC), and public network-ownership (RDAP/ASN) signals.
