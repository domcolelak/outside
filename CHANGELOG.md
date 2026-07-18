# Changelog

All notable release changes are recorded here. OUTSIDE uses semantic versioning; release candidates are not promoted to a stable tag until staging validation and the applicable launch gates are complete.

## [0.2.0-rc.1] — Unreleased

### Added

- Guardian continuous monitoring, correlated change events, Exposure Drift, living security checklist, remediation guidance, digesting, notification routing, retention, partition maintenance, and operational telemetry.
- Agency Suite portfolio operations, customer grouping, white-label portals and reports, analyst/client roles, bulk workflows, SLA tracking, billing hierarchy, API keys, search, and portfolio Guardian views.
- Enterprise identity, OIDC/SAML-broker guidance, SCIM, resource ownership, policy/scoring/exception workflows, immutable audit chains, integration delivery, REST/GraphQL APIs, Terraform provider, exports, licensing, and retention controls.
- Immutable Evidence & Intelligence history with provenance, source reliability, deterministic correlation, contradictions, entity resolution, and historical DNS/certificate/HTTP/technology views.
- Production browser/accessibility journeys, PostgreSQL integration and migration-upgrade coverage, isolated dump/restore regression, production-container smoke tests, and release artifact generation.

### Changed

- Production now fails closed without durable PostgreSQL, canonical HTTPS configuration, independent secrets, and complete optional integration configuration.
- Sessions use production `__Host-` cookies; browser mutations use same-origin enforcement; CSP uses per-request nonces and dynamic rendering.
- Scan, graph, report, Guardian, Agency, Enterprise, and provider paths have bounded concurrency, pagination, caching, retries, idempotency, and observability.
- Package and Terraform provider release version is `0.2.0-rc.1`.

### Security

- Centralized IP-pinned HTTPS prevents SSRF, DNS rebinding, unsafe redirects, private-address access, credential-bearing destinations, unbounded responses, and hostname-verification bypass.
- Tenant authorization and recommendation/evidence isolation are enforced across direct, Agency, Enterprise, public-share, API-token, and integration paths.
- Invitations, recovery tokens, API keys, SCIM tokens, and share links are hashed, expiring, scoped, revocable, and rate limited as applicable.
- Stripe webhooks are signature-checked, replay-safe, transactionally applied, and monotonically ordered.

### Operations

- Added non-root standalone and migration images, liveness/readiness endpoints, structured request correlation, OTLP metrics, recovery runbooks, dependency/licence/secret policy, and exact release manifests.
- Added release metadata to health responses and OpenTelemetry resources.
- Added a repeatable production-like staging topology with HTTPS, real PostgreSQL, scheduled workers, OTLP/Prometheus/Grafana observability, actionable alerts, and encrypted logical backups.
- Added launch validation covering HTTPS browser journeys, measured probes, process/database recovery, leased-work recovery, wrong-key rejection, clean restore, and restored application startup.
- Added pilot SLOs, launch evidence rules, customer/pilot operations, independent penetration-test scope, and technical legal-review input.

### Known non-blocking risks

- Independent penetration testing, managed PITR/key-loss drills, production SLO history, legal/regional review, and real pilot-customer validation remain external release activities.
- Per-request nonce CSP requires dynamic rendering and should be included in capacity measurements.
- Database-leased scheduling is appropriate for the pilot; queue age and lock contention must be measured before committing to large-fleet SLOs.

[0.2.0-rc.1]: https://github.com/domcolelak/outside/compare/master...feature/guardian
