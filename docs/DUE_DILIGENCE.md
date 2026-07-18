# Technical due diligence — 2026-07-17

## Executive assessment

OUTSIDE is a security-focused modular monolith with explicit tenant boundaries, deterministic evidence provenance, centralized outbound-request protection, durable idempotency, and unusually broad repository-level validation for its maturity.

**Repository-controlled release readiness: 100/100 when the current head CI workflow is green.** This score covers code, migrations, browser journeys, the production container, dependency/licence/secret policy, PostgreSQL recovery regression, and the Terraform provider. It is not an independent audit or a score for an unknown production deployment.

Enterprise operational assurance remains incomplete until an external penetration test, managed PITR/key-recovery drill, representative sustained-load evidence, production SLO history, and regional/vendor governance are recorded.

## Strengths

- Deterministic discovery, evidence, scoring, recommendations, and explicit observed/inferred/possible semantics.
- Central SSRF/DNS-rebinding boundary with public-address validation, IP-pinned TLS, hostname and redirect validation, byte limits, and deadlines.
- Hashed expiring invitations and tokens, rotating signed sessions, production `__Host-` cookies, same-origin mutation enforcement, per-request nonce CSP, RBAC, and tenant-scoped persistence.
- Temporal asset identity, immutable evidence snapshots, contradiction visibility, audit hash chains, partitioned history, retention controls, transactional Stripe processing, leased jobs, and bounded retries.
- Guardian, Agency, and Enterprise features reuse the same evidence foundation rather than creating parallel facts.
- CI validates strict types, lint, unit tests, PostgreSQL workflows and migration upgrades, dump/restore compatibility, browser/accessibility/mobile journeys, the production container, dependency policy, and the Terraform provider.
- Deployment, disaster recovery, incident response, capacity, privacy, billing, runbook, release, architecture, and handover documentation are maintained with the implementation.

## Material residual risks

1. **Independent security assurance:** no external penetration test or independent end-to-end threat-model review is recorded.
2. **Operational recovery:** CI proves logical PostgreSQL dump/restore compatibility, but not the operator's managed PITR, cross-account backup, contractual RPO/RTO, or encryption-key recovery.
3. **Scale evidence:** algorithmic and smoke budgets exist, but sustained provider, database, queue, Agency, and Enterprise fleet measurements must be collected in the target deployment.
4. **Third-party configuration:** email, billing, SSO, SIEM/SOAR, and notification reliability still depends on correctly governed vendor tenants and production smoke tests.
5. **Regional and legal assurance:** region labels are immutable, but residency and privacy claims depend on databases, logs, backups, metrics, subprocessors, and contracts.
6. **Queue scaling path:** database leases and authenticated schedulers are appropriate now; measured contention and queue age should trigger—not speculation—a future dedicated broker decision.
7. **SAML boundary:** native OIDC is implemented; SAML requires a trusted SAML-to-OIDC broker and must not be marketed as a native SAML service provider.
8. **Key-person and operating-model risk:** system breadth requires named on-call ownership, vendor contacts, access transfer, incident exercises, and periodic restore evidence.

## Completed final-pass fixes

- Added fail-closed configuration and secret separation, origin/CSRF controls, strict nonce CSP without `unsafe-inline`, hardened sessions, password recovery/session revocation, request bounds, safe exports, and health probes.
- Hardened tenant isolation and transactional audit coupling across Guardian, Agency, Enterprise, SCIM, API, GraphQL, ticket, event, identity, and billing workflows.
- Added monotonic Stripe processing, durable email, queue leases/idempotency/backoff, cron continuation, retention/partitioning, OpenTelemetry queue/provider metrics, and explicit provider degradation.
- Added bounded DNS caching, streamed identity maps, graph spatial/Barnes-Hut scaling, report limits, database indexes, pooling guidance, and memory/log bounds.
- Added PostgreSQL integration coverage for tenant isolation, immutable audit/concurrency, delivery recovery, password reset, retention, and advisory-lock workflows.
- Added a non-root standalone container, migration target, production readiness/demo smoke, historical migration upgrade, logical dump/isolated restore, and Terraform reproducibility.
- Added Chromium accessibility, hardened signup-session, authenticated workspace, deterministic demo/Attacker View, responsive, and latency regression journeys.
- Added dependency, licence, and secret policy gates plus buyer/operator documentation.

## Required actions before broad sale

1. Complete an independent penetration test and deployed threat-model review; retain remediation evidence.
2. Execute managed PITR, cross-account restore, key-loss, queue replay, and duplicate-egress exercises against staging.
3. Run the documented 10/100/1,000+ asset and representative portfolio workloads; derive SLOs and concurrency from measurements.
4. Smoke-test each enabled production vendor integration with least-privilege credentials and documented ownership.
5. Establish on-call coverage, incident notification obligations, dependency approval, vendor contingency, subprocessor inventory, and regional data-flow evidence.
6. Continue expanding browser coverage for billing, verification, white-label portals, and enterprise provisioning as those workflows become release-critical.

## Buyer conclusion

The repository is suitable for a controlled production release once its required head CI run is green. It has no known unresolved critical code defect from this review. A buyer should value the deterministic evidence architecture, temporal history, agency workflows, and explicit security boundaries, while pricing the remaining operational and independent-assurance work separately from repository quality.
