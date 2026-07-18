# Production-readiness evidence — 2026-07-17

## Status and scope

**REPOSITORY RELEASE GATES COMPLETE**

OUTSIDE has a complete automated release gate for the risks that can be verified from this repository. A release is approved only when the current head commit passes every required CI job. This represents **100% of repository-controlled release readiness**, not a claim that an unobserved production environment has zero risk.

Independent penetration testing, managed PostgreSQL PITR evidence, production key-recovery exercises, sustained fleet-load history, vendor configuration, and legal/data-residency assurance remain operator or third-party responsibilities. OUTSIDE must not be described as independently audited or operationally certified until those activities are completed.

## Material controls completed

- Fail-closed production configuration for durable storage, canonical HTTPS origin, independent secrets, complete optional integration pairs, and correctly decoded encryption keys.
- Per-request nonce CSP with dynamic rendering, HSTS/security headers, same-origin browser mutations, trusted request IDs, production `__Host-` sessions, secret rotation, bounded JSON bodies, and formula-safe exports.
- Tenant-scoped RBAC, API tokens, invitations, SSO/SCIM boundaries, transactional immutable audit events, session revocation, and enumeration-safe password recovery.
- Transactional Stripe replay protection and event ordering; leased/idempotent queues; bounded retries, backoff, retention, partition maintenance, and visible degraded states.
- IP-pinned HTTPS with DNS-rebinding, redirect, public-address, hostname, body-size, and deadline enforcement.
- Deterministic evidence, confidence, scoring, recommendations, demo isolation, provider-failure visibility, and immutable evidence history.
- Database indexes, bounded pagination and logs, DNS caching, graph culling/spatial hit testing/Barnes-Hut scaling, report concurrency, and queue/provider OpenTelemetry metrics.
- Non-root standalone production container, migration image, readiness/liveness probes, structured logs, dependency/licence/secret gates, and operational documentation.

## Automated validation contract

| Gate | Required evidence |
| --- | --- |
| Install and supply chain | Reproducible `npm ci`; production audit at high severity; locked-package licence policy; repository secret scan. |
| Unit/regression | `159` tests across `38` files, including auth/session, tenant isolation, SSRF/DNS rebinding, scoring/evidence, Guardian recovery, Stripe ordering, export safety, caching, graph correctness, and production configuration. |
| Static validation | ESLint with zero warnings, strict TypeScript, Prisma schema validation, and production Next.js build. |
| PostgreSQL | PostgreSQL 16 clean migrations, `13` integration workflows, historical-checkpoint upgrade, transactional/tenant/lease/advisory-lock coverage, logical dump, isolated restore, and post-restore reads. |
| Browser | Five production-build Chromium journeys covering landing/auth accessibility, hardened signup session contract, authenticated workspace rendering, deterministic demo and Attacker View, mobile overflow, and a 120-request liveness budget. |
| Container | Migration image, non-root production image, real PostgreSQL readiness, and deterministic demo smoke test. |
| Terraform | Reproducible `go.sum`, `go mod tidy` cleanliness, and `go test ./...`. |
| Performance regression | 1,000-node Barnes-Hut ceiling plus browser liveness p95 under the deliberately generous release threshold. These are regression gates, not customer-facing SLOs. |

## External evidence still required

| Evidence | Why repository automation cannot prove it | Required before |
| --- | --- | --- |
| Independent penetration test and threat-model challenge | Independence and deployed infrastructure are outside the repository trust boundary | Broad enterprise/public launch |
| Managed backup/PITR and key-loss drill | CI validates logical dump compatibility, not the operator's backup service, RPO/RTO, or secret manager | Paying production |
| Representative 10/100/1,000+ fleet load and SLO history | Provider networks, database sizing, queue schedules, and traffic shape are deployment-specific | Contractual scale/SLO commitments |
| Production-like provider, email, SSO, and billing sandbox smoke | Credentials and vendor tenancy must not be embedded in CI | Enabling each integration |
| Regional data-flow, subprocessor, privacy, and contractual review | Residency is determined by infrastructure, logs, backups, vendors, and contracts | Making regional/compliance claims |

## Production requirements

- Node 20.20+, PostgreSQL 16 with TLS, least privilege, pooling, encrypted PITR backups, and a tested restore process.
- `OUTSIDE_STORAGE_MODE=database`, `DATABASE_URL`, canonical HTTPS `APP_URL`, and independent high-entropy auth, verification, cron, email, Guardian, and Enterprise secrets as applicable.
- Run `prisma migrate deploy` once from the controlled migration image before new instances; never use `db push` in production.
- Configure authenticated scan, Agency, Enterprise, and retention schedulers; continue bounded cursor work to completion.
- Apply migrations to an isolated restore of representative production data before a release that changes existing data semantics.
- Alert on readiness, error ratio, provider latency/failure, queue age/depth, retry/dead work, cron staleness, delivery outcomes, billing webhooks, database saturation/replication/storage, retention saturation, process resources, and backup failure.

## Rollback and recovery

- Roll back application traffic to the prior immutable image, then verify readiness and scheduler ownership.
- Prefer reviewed roll-forward migrations; restore the recorded pre-release backup when data safety requires it. Never blindly reverse a data migration.
- Preserve queued rows during incidents, allow leases to expire, and verify idempotency before resuming egress.
- Retain partial deterministic evidence during provider outages and suppress false mass-change conclusions.
- Restore encryption keys from the audited secret manager; a database backup cannot recover encrypted provider credentials without the key.

## Honest readiness statement

When the current head CI workflow is green, OUTSIDE is a repository-verified release candidate with **100% of its automated code, migration, browser, container, recovery-regression, and provider build gates passing**. “100% production ready” must not be used to imply completed external audit, deployed-environment resilience, contractual compliance, or zero residual risk.
