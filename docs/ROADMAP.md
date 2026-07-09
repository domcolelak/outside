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

## Priority 2 — Accounts, organizations, verification
- **Domain verification — ✅ BUILT:** DNS-TXT ownership proof (`outside-verify=<token>`) in
  `lib/verify/`, `app/api/verify/`, and `components/VerifyPanel.tsx`; token issue + DoH check +
  persisted verification state; the scan header reflects Unverified vs Verified organization.
  Remaining: file-based (`/.well-known/outside-verify.txt`) as a fallback method.
- **Auth (remaining):** email + OAuth (Auth.js). Roles: `owner | admin | analyst | viewer`. Bind
  verified domains to an authenticated organization (today verification is workspace-global).
- **Gating (remaining):** once auth lands, gate active/deeper providers and monitoring behind a
  verified + authorized flag. The UI and verification state are already in place to drive this.

## Priority 3 — Background workers & monitoring
- **Queue:** BullMQ (Redis) or a serverless cron. Scheduled per-target scans (daily/weekly).
- **Job design:** idempotent by `(target_id, scan_window)`; dedupe concurrent scans of one target;
  resumable/cancellable; retry providers with backoff; reap stale jobs.
- **Integration point:** the engine is a pure async function `(target, scanId, emit) => ScanResult`;
  a worker calls it with a persisting `emit` instead of the SSE `emit`.

## Priority 4 — Reporting, email, alerting
- **PDF export:** server-render the executive summary + graph snapshot (`@react-pdf` or Playwright).
- **Email:** React Email + Resend. Templates: welcome, verify, verification instructions, scan
  complete, high-priority change, weekly summary, subscription update.
- **Alerting:** group related `change_event`s; suppress low-signal noise; per-user notification prefs.

## Priority 5 — Billing (Stripe)
- Plans mirror the landing page (Snapshot / Professional / Agency). Checkout, billing portal,
  webhook verification + idempotency keys, plan-limit enforcement server-side (never trust the client),
  upgrade/downgrade/cancel, failed-payment handling.

## Priority 6 — AI explanation layer
- Provider-abstracted (Anthropic default). **Read-only** over a finalized `ScanResult`; output stored
  as a separate `AIAnalysis` record. Used for executive summaries, plain-English finding explanations,
  and ambiguous-finding ranking. Never mutates deterministic results. Absent key ⇒ templated summaries.

## Graph scale
- Current: `O(n²)` force sim, smooth into the hundreds of nodes.
- 1,000+ nodes: Barnes–Hut quadtree for repulsion, viewport culling, and level-of-detail label
  rendering. Node clustering by registrable domain / kind for very large surfaces.

## Additional providers (abstracted behind the provider interface)
Passive subdomain intelligence, HTTP observation + technology fingerprinting (with the SSRF-pinned
connector), mail-security deep checks (DKIM/DMARC), and public network-ownership (RDAP/ASN) signals.
