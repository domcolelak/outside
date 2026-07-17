# Technical due diligence — 2026-07-16

## Executive assessment

OUTSIDE has a coherent modular-monolith architecture, unusually explicit evidence provenance, strong outbound-request controls, tenant-scoped access helpers, durable idempotency, and meaningful integration tests. It is credible as an advanced pre-launch product. It is not yet reasonable to describe it as independently audited, penetration-tested, disaster-recovery proven, or operationally mature at enterprise scale.

**Production-readiness score: 86/100 for a controlled launch; 74/100 for an enterprise-wide rollout.** The difference is operational evidence: load tests, browser journeys, restore drills, external security review, SLO history, and large-fleet production telemetry do not exist in this repository. The score is an engineering assessment, not certification.

## Strengths

- Deterministic discovery, scoring, recommendations, and explicit observed/inferred/possible semantics.
- Central SSRF/DNS-rebinding boundary with public-address validation, IP-pinned HTTPS, hostname verification, redirect validation, byte limits, and deadlines.
- Hashed, expiring invites and API tokens; signed rotating sessions; production `__Host-` cookie; origin checks; nonce CSP; RBAC and tenant-scoped persistence.
- Temporal asset identities, immutable evidence snapshots, audit hash chains, partitioned history, bounded retention, transactional Stripe webhook idempotency, leased jobs, and retry/backoff.
- Guardian, Agency, and Enterprise features reuse the same evidence source instead of inventing parallel facts.
- CI covers tests, lint, strict type checking, build, production dependency audit, PostgreSQL workflows, and the Terraform provider.

## Material risks

1. **Operational assurance:** no recorded restore drill, external penetration test, sustained load test, formal threat-model review, or production SLO history.
2. **Browser coverage:** Vitest and PostgreSQL integration tests are substantial, but critical auth, verification, billing, white-label, mobile, and accessibility journeys lack automated browser tests.
3. **Independent security assurance:** repository controls and regression tests are meaningful, but no external penetration test or independent design review has yet challenged the complete deployed trust boundary.
4. **Queue architecture:** jobs are database-leased and cron-driven. This is maintainable for the current scale but scheduler latency and database contention must be measured before very large fleets.
5. **Data residency:** deployments are region-pinned and relabeling is rejected, but residency depends on the operator's database, logs, backups, email, metrics, and provider configuration.
6. **SSO boundary:** native OIDC is implemented. SAML intentionally requires a trusted SAML-to-OIDC broker; OUTSIDE is not a native SAML service provider.
7. **Key-person risk:** system breadth is high relative to repository maturity. Runbooks now exist, but on-call, vendor contacts, security response, and restore evidence are organizational work.
8. **Dependency lifecycle:** the production audit is clean at this snapshot, but major upgrades require planned compatibility and licence review.

## Fixes completed in the final pass

- Added browser mutation origin enforcement, bounded and content-type-validated API bodies, per-response CSP nonces, production `__Host-` sessions, password reset with single-use hashed tokens and session revocation, liveness/readiness probes, correlated structured logs, and safe health errors.
- Removed Enterprise overview full-table count reads, added cursor-bounded fleet operations, transactionally audited generic and specialized Enterprise mutations (including SCIM, event fan-out, ticket callbacks, token rotation, and workspace changes), and bounded operational retention with supporting indexes.
- Added Stripe event-order protection, stable checkout idempotency, verified webhook metrics, formula-safe centralized CSV encoding, production fail-closed configuration validation, secret scanning, and commercial licence policy checks.
- Added bounded DNS caching and cache metrics, O(1) streamed asset/edge deduplication, capped scan logs, spatial-hash graph hit testing, lower high-density rendering cost, and a 1,000-node Barnes-Hut regression test.
- Added PII-free allowlisted funnel events, truthful scheduled-monitoring copy, reserved-domain demo copy, explicit synthetic labels, explainable confidence labels, and resilient accessible verification UX.
- Added deployment, incident, recovery, operator, moat, and handover documentation.

## Required actions before broad sale

1. Run an independent penetration test and threat-model review, then retain remediation evidence.
2. Add browser E2E for critical user and tenant-isolation journeys and automated accessibility checks at desktop/mobile breakpoints.
3. Execute the documented load matrix at 10, 100, and 1,000+ assets plus representative Agency/Enterprise fleets; establish SLOs from results.
4. Complete a PostgreSQL point-in-time restore drill, key-loss exercise, and queue replay/duplicate-delivery test.
5. Establish dependency/licence approval, on-call ownership, incident notification obligations, vendor contingency, and regional data-flow documentation.
