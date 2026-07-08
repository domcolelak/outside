# Roadmap & handover notes

This document is the honest boundary between what ships in this repository and what is designed but
not yet implemented. Each item lists the integration point the current code already exposes, so a
buyer or the next engineer can extend rather than rebuild.

## Priority 1 — Persistence & temporal tracking
- **Store:** PostgreSQL (Prisma or Drizzle). No graph DB — see ARCHITECTURE rationale.
- **Model:** `organization`, `target`, `scan`, `asset_identity` (stable, keyed by canonical),
  `asset_snapshot` (per-scan), `edge_snapshot`, `finding_occurrence`, `score`, `change_event`,
  `audit_event`.
- **Integration point:** the engine already emits a snapshot-shaped `ScanResult`. Persist it by
  upserting `asset_identity` on `canonical` and inserting one `asset_snapshot` per asset per scan.
- **Change detection:** diff consecutive snapshot sets → `change_event` rows (new / disappeared /
  returned / technology-changed / certificate-changed). Powers the graph diff view and alerts.

## Priority 2 — Accounts, organizations, verification
- **Auth:** email + OAuth (Auth.js). Roles: `owner | admin | analyst | viewer`.
- **Domain verification:** DNS-TXT (`outside-verify=<token>`) and file-based (`/.well-known/outside-verify.txt`).
- **Integration point:** `/api/scan` already distinguishes an **unverified external view** from a
  verified path via the `mode`/result flags; gate deeper providers on a verified flag.

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
