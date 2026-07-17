# Final production-readiness evidence — 2026-07-17

## Status

**NOT READY FOR PRODUCTION**

The implementation has no known critical code defect from this review, but the release cannot be approved until the current commit passes the production build and PostgreSQL jobs in a networked CI environment. The local Windows sandbox blocks child-process creation and has no PostgreSQL, Docker, `psql`, or Go toolchain. Independent penetration testing, a restore drill, browser E2E, and representative load evidence also remain external release requirements.

The engineering assessment is **86/100 for a controlled launch** and **74/100 for broad enterprise rollout**. This is not certification and does not override the release gates below.

## Material changes completed

- Fail-closed production environment validation for durable storage, canonical HTTPS origin, independent auth/verification/cron/email secrets, complete Stripe configuration, and correctly decoded independent encryption keys.
- Nonce CSP, HSTS/security headers, same-origin mutation enforcement, trusted request IDs, production `__Host-` sessions, controlled secret rotation, bounded/content-type-validated JSON, and formula-safe CSV exports.
- Enumeration-safe password-reset request, hashed expiring single-use tokens, atomic password update/session revocation, durable email, cleanup, UI, schema, migration, unit tests, and PostgreSQL workflow coverage.
- Tenant-scoped Enterprise RBAC/API tokens and transactional audit coupling for generic resources, workspace/licence changes, identity, SCIM lifecycle, GraphQL mutations, event fan-out, ticket callbacks, and token rotation.
- Stripe signature/replay validation, stable checkout idempotency, monotonic event ordering with terminal-event precedence, transactional state, metrics, tests, schema, and migration.
- IP-pinned HTTPS with public-address validation, DNS-rebinding/redirect controls, bounded bodies/deadlines, credential-free URL validation, and regression tests.
- Leased/idempotent jobs, bounded retry/backoff, continuation cursors, retention/partition maintenance, queue/provider metrics, and visible 503 degradation when cron scan or delivery stages fail.
- Bounded DNS caching, scan-stream identity maps, capped logs, graph culling/spatial hit testing/Barnes-Hut scaling, report concurrency, pagination, and a 1,000-node regression budget.
- Liveness/readiness endpoints, structured bounded logs with trace correlation, scan/report/billing/delivery metrics, secret scan, licence policy, dependency inventory, and production-like CI configuration.
- Privacy/data, billing, deployment, release, performance, disaster recovery, incident response, runbook, handover, architecture, Enterprise, due-diligence, and dependency documentation.

## Validation evidence

| Gate | Evidence in this workspace |
| --- | --- |
| Clean install | `npm ci --ignore-scripts --cache .npm-cache`: 483 packages installed, 0 vulnerabilities. Full postinstall requires Prisma generator child process and is blocked locally by `spawn EPERM`. |
| Unit/regression tests | `36` files passed; `155` tests passed. Includes auth/session, tenant access, SSRF/DNS rebinding, request origin/body limits, encryption, scoring/evidence, Guardian recovery/deduplication, billing ordering, CSV injection, caching, graph correctness/performance, and production configuration. |
| Lint | Passed with zero warnings. |
| Strict type checking | Passed before the clean reinstall (`tsc --noEmit`). After reinstall, local Prisma regeneration is blocked; CI must repeat the gate against the freshly generated client. |
| Production build | Attempted with production-like secrets/storage/origin; blocked at Next worker creation with Windows sandbox `spawn EPERM`. No code-level build error was produced. Must pass CI. |
| Prisma schema | `prisma validate`: valid. Four release migrations were added for Enterprise control plane, hardening/indexes, password reset, and Stripe ordering. |
| PostgreSQL E2E/migrations | Tests exist for Guardian, Agency, Enterprise isolation, audit concurrency/immutability, delivery leases, transactional rollback, and password reset. Local run reached database initialization and failed because `127.0.0.1:5432` is unavailable. Must pass CI PostgreSQL 16. |
| Dependency audit | Full `npm audit --audit-level=high`: 0 vulnerabilities. |
| Licence audit | Passed for 562 locked packages; licence families and shipping obligations documented. |
| Secret scan | Passed for 374 source/configuration/documentation files after excluding dependency, build, and package-cache directories. |
| Performance | 1,000-node Barnes-Hut regression passed with a 750 ms shared-runner ceiling. Real browser/fleet/load matrix remains unmeasured. |
| Terraform provider | CI job downloads modules and runs `go test ./...`; local Go is unavailable and `go.sum` is not yet committed. Do not tag/distribute the provider until its lockfile and CI pass. |

## Remaining risks

| Risk | Severity / likelihood | Impact | Mitigation | Launch blocker |
| --- | --- | --- | --- | --- |
| Current revision lacks successful production build and PostgreSQL CI evidence | High / certain until run | Undetected compile, migration, or DB workflow failure | Authenticate GitHub CLI, push the revision, require all CI jobs | Yes |
| No independent penetration test/threat-model challenge | High / medium | Trust-boundary defect could remain undiscovered | Test deployed production-like environment; remediate and retain evidence | Yes for enterprise/broad public launch; controlled private pilot only by explicit risk acceptance |
| No restore/PITR and key-loss drill evidence | High / medium | Extended outage or unrecoverable encrypted credentials | Execute the documented isolated restore and key-loss exercises; record RPO/RTO | Yes for paying production |
| No automated critical browser/accessibility journeys | Medium / medium | Auth, verification, billing, portal, mobile, or accessibility regressions | Add Playwright plus axe at desktop/mobile breakpoints | No for a tightly controlled pilot with manual release scripts; yes for broad rollout |
| No representative network/database/fleet load evidence | Medium / medium | Queue age, DB pool, provider cost, memory, or latency may breach expectations | Run and retain the documented workload matrix; derive SLOs/concurrency | No for low-volume pilot; yes before large fleets |
| Terraform provider has no committed `go.sum` | Medium / certain | Provider build is less reproducible | Generate with Go 1.22, commit, run `go mod verify` and tests | Blocks Terraform provider release, not the web application |
| Regional/legal controls depend on operator infrastructure and contracts | Medium / medium | Residency or privacy commitments may be false | Complete data-flow/subprocessor register and regional deployment review | Blocks unsupported contractual claims |

## Production requirements

- Node 20.20+, PostgreSQL 16 with TLS, least-privilege role, pooling, encrypted PITR backups, and tested restore.
- `OUTSIDE_STORAGE_MODE=database`, `DATABASE_URL`, canonical HTTPS `APP_URL`, independent 32+ byte `AUTH_SECRET`, `OUTSIDE_VERIFY_SECRET`, `CRON_SECRET`, Resend key/from identity, and approved proxy forwarding.
- Guardian/Enterprise 32-byte AES keys when enabled; Enterprise provisioning token and audit salt; complete Stripe and OAuth pairs when enabled.
- Apply `prisma migrate deploy` from one controlled release task before new instances. Never use `db push` in production.
- Authenticated schedulers for scan, Agency, Enterprise, and retention routes; continue Enterprise cursors to completion.
- Run migrations against a restored representative pre-release database in staging, in addition to the clean-database CI job.

## Day-one monitoring

Alert on readiness failure, API/scan error ratio, p95 provider latency, provider error ratio, oldest queue age/depth, retry/dead work, missed/non-2xx cron, notification/integration failures, Stripe signature/processing failure and webhook silence, DB pool/locks/replication/storage, report saturation, retention saturation, process CPU/memory, and backup/PITR failure. Keep tenant identifiers out of metric labels and access-control operational logs.

## Rollback and recovery

- Failed application deployment: stop traffic, restore the prior image, verify liveness/readiness and scheduler ownership.
- Failed migration: stop rollout, inspect the actual schema, restore from the pre-release backup when data safety requires it, or roll forward with a reviewed corrective migration. Never blindly reverse data migrations.
- Queue failure: stop consumers if corruption is suspected; preserve rows, let leases expire, resume bounded consumers, and verify idempotency before egress.
- Provider outage: retain partial evidence with explicit provider failure, allow bounded retry/backoff, suppress false mass-change alerts, and disable only the affected connector if needed.
- Key loss: restore the key from the audited secret manager. Database backup alone cannot decrypt integration credentials; without a valid current/previous key those credentials must be rotated at providers.
- Database failure: fail readiness, restore/PITR into isolation, verify tenant boundaries, hashes/audit chains, billing state, and duplicate-delivery behavior before enabling egress/traffic.

## Deferred non-blocking improvements

- Replace the unsupported ESLint 8 toolchain during a dedicated flat-config migration.
- Establish production SLO history and tune budgets from evidence.
- Automate browser journeys, accessibility scans, restore drills, and release evidence capture.
- Add a complete Terraform module lockfile and release workflow.
