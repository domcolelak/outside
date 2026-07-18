# OUTSIDE

OUTSIDE is a defensive external-surface discovery and monitoring application. It maps public evidence for a domain, streams the scan as an interactive graph, derives deterministic findings and an exposure score, and tracks change for verified organizations.

OUTSIDE Guardian is the premium continuous-intelligence subsystem. It retains normalized observations, correlates meaningful changes across time, calculates Exposure Drift, maintains a living security checklist, produces evidence-backed recommendations and remediation guides, groups workflow notifications, and generates weekly executive digests. Guardian never creates assets, weaknesses, or evidence that the deterministic discovery pipeline did not observe. Evidence Intelligence seals each scan's raw and normalized observations with SHA-256, attributes provider reliability and discovery provenance, detects correlations and contradictions, and exposes evidence graphs plus DNS, certificate, HTTP, and technology history for every persisted finding.

The application is a single Next.js 15 App Router deployment using TypeScript, React 19, Prisma, PostgreSQL, Vitest, and `@react-pdf/renderer`.

## Capability boundary

- Anonymous scans use passive public sources and are not persisted.
- Authenticated organizations can verify a domain with DNS TXT or a well-known HTTPS file.
- Active HTTPS/TLS observation, durable history, recommendations, monitors, AI explanations, and PDF reports require authenticated access to a verified target; paid entitlements apply where configured.
- Aegis change proposals are validated previews. The connector registry detects configured credentials but does not execute, verify, or roll back provider changes.
- AI is optional and read-only over deterministic scan results. It cannot add assets, findings, or scores.
- Demo data is synthetic and explicitly identified as such.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Development and test may use `OUTSIDE_STORAGE_MODE=memory`. Production fails closed unless `DATABASE_URL`, `OUTSIDE_STORAGE_MODE=database`, `AUTH_SECRET`, and `OUTSIDE_VERIFY_SECRET` are correctly configured. See [`.env.example`](.env.example).

For a local PostgreSQL database:

```bash
npm run db:generate
npm run db:migrate
npm run test:e2e
```

## Validation

```bash
npm test
npm run test:browser
npm run lint
npm run typecheck
npm run build
```

CI runs the same gates plus PostgreSQL 16 clean/upgrade migrations, integration workflows, an isolated dump/restore drill, Chromium desktop/mobile journeys with accessibility checks and a production-container smoke test. Dependency update pull requests are configured through Dependabot.

## Architecture

The core pipeline is:

```text
request -> authorization/rate limits -> discovery providers -> normalization
        -> graph/evidence -> signals/findings/score -> persistence -> SSE/UI
```

Key areas:

- `app/api`: authenticated API boundaries, SSE scans, cron, billing, and webhooks.
- `lib/discovery`: bounded CT, DNS/CNAME infrastructure signals, and verified-target HTTPS/TLS/header observation.
- `lib/security`: target validation, IP pinning, request limits, and distributed rate controls.
- `lib/analysis`: deterministic classification, finding generation, and scoring.
- `lib/persistence`: tenant-scoped temporal identity, snapshots, diffs, and history.
- `lib/monitoring`: atomic monitor claims, retry/backoff, and scheduled scans.
- `lib/aegis`: recommendations, proposal validation, status, and audit trail.
- `lib/guardian`: continuous snapshots, event correlation, Exposure Drift, checklist controls, recommendation/remediation generation, encrypted integrations, retryable delivery, executive digests, and tenant retention.
- `lib/observability`: low-cardinality OpenTelemetry metrics for discovery providers, Guardian queue age/depth, delivery outcomes, and retention.
- `lib/auth`: signed sessions, RBAC, invites, OAuth, and email verification.
- `lib/email`: durable outbox, templates, provider deadlines, and alerts.
- `components/graph`: canvas graph with Barnes-Hut scaling, reconciliation, culling, and idle suspension.
- `prisma/schema.prisma`: durable multi-tenant data model.

The complete design and operational trade-offs are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Current limitations and future work are in [`docs/ROADMAP.md`](docs/ROADMAP.md).

Production operators should also read the [current readiness evidence](docs/PRODUCTION_READINESS.md), [launch evidence contract](docs/LAUNCH_VALIDATION.md), [production-like staging guide](ops/staging/README.md), [deployment guide](docs/DEPLOYMENT.md), [release checklist](docs/RELEASE_CHECKLIST.md), [initial SLOs](docs/SLOS.md), [runbooks](docs/RUNBOOKS.md), [incident response plan](docs/INCIDENT_RESPONSE.md), [disaster recovery guide](docs/DISASTER_RECOVERY.md), [customer launch guide](docs/CUSTOMER_LAUNCH.md), [pilot operations](docs/PILOT_OPERATIONS.md), [penetration-test package](docs/PENTEST_PACKAGE.md), [legal-review input](docs/LEGAL_REVIEW_INPUT.md), [privacy and data handling guide](docs/PRIVACY_DATA.md), [billing runbook](docs/BILLING.md), [capacity guide](docs/PERFORMANCE.md), and [handover guide](docs/HANDOVER.md). The factual acquisition assessment and remaining material risks are in [technical due diligence](docs/DUE_DILIGENCE.md); durable product advantages are separated from speculative work in [the moat brief](docs/MOAT.md).

## Security model

- Organization IDs are derived from authenticated memberships, not trusted from the client.
- Targets, verification records, scans, history, recommendations, and monitors are organization-scoped.
- Outbound HTTPS resolves and validates every address, rejects special-use IPv4/IPv6 space, and connects to a validated IP with hostname verification to prevent DNS rebinding.
- Session and verification signing keys are mandatory and independent in production, with controlled session-secret rotation.
- Invite tokens are random, stored as hashes, bound to the invited email, expire, and are consumed atomically.
- Shared database-backed rate limits, concurrency leases, cron claims, webhook idempotency, and email delivery state support multi-instance deployments.
- Provider bodies are bounded by bytes, content types are checked, deadlines are enforced, and errors returned to clients are sanitized.

This is defensive discovery software. It intentionally contains no exploitation, credential attack, brute-force, or payload capability.

## Agency Suite

Agency Suite is the Agency-plan control plane for MSPs, MSSPs, consultants, and resellers. It layers an explicitly authorized portfolio relationship over existing organizations; it does not weaken organization tenancy or copy Guardian evidence into a second source of truth.

- `/agency` provides portfolio health, customer grouping, risk heatmaps, Portfolio Guardian, cross-customer asset/finding search, analyst priorities, change feeds, and bulk scan/report workflows.
- Agency RBAC separates owner, admin, manager, analyst, billing, and viewer duties. API keys use hashed secrets and narrow scopes.
- Client linking requires an owner session for the client organization. Client portal invitations are hashed, expiring, single-use grants; the portal exposes only shared findings, shared notes, deterministic posture and published reports.
- White-label branding includes verified custom-domain routing, branded email, logo/colors, support identity, PDF reports and immutable report-time branding snapshots. Emailed report links use random, hashed, tenant-scoped, seven-day access grants.
- Per-client service tier, persistent SLA lifecycle, validated notification routing, portal mode, billing mode, price, currency, grouping, and external reference support agency operations and reseller billing hierarchies. The management center includes usage trends, MRR rollups and billing CSV export.
- Bulk jobs are idempotent. Bulk scans only make already-configured, verified monitors due; they never create or scan an unverified target.

Set `OUTSIDE_AGENCY_SEAT_LIMIT` to the licensed active-seat plus pending-invite ceiling (default `100`). Apply migrations before enabling Agency Suite in database mode.

## Enterprise control plane

OUTSIDE Enterprise is an isolated control plane layered on an organization. SMB and Professional organizations retain the existing product experience until a licensed `EnterpriseWorkspace` is provisioned.

- `/enterprise` contains SAML-brokered and native OIDC federation, SCIM 2.0 lifecycle provisioning, group-aware scoped RBAC, organization/department hierarchy, asset and risk ownership, policy/scoring rules, independent approvals, and time-bound risk exceptions.
- Enterprise API tokens are SHA-256 hashed, shown once, permission-limited, optionally resource-scoped, expiring and revocable. REST is versioned under `/api/enterprise/v1`; `/api/enterprise/graphql` accepts documented persisted operations to keep cost and authorization deterministic.
- Audit events are database append-only and form a canonical SHA-256 chain over sequence, timestamp, actor, action, resource, request metadata and detail. JSON, CSV and NDJSON exports verify the complete chain before returning data.
- Splunk, Microsoft Sentinel, Elastic, QRadar, Chronicle, Cortex XSOAR, ServiceNow, Freshservice, Jira Service Management, PagerDuty, Opsgenie and signed custom webhooks use encrypted credentials, SSRF-safe IP-pinned HTTPS, idempotent leased delivery, exponential retry and provider-specific payloads. Ticket callbacks require a timestamped HMAC signature.
- Executive and compliance evidence reports are available as JSON, CSV and PDF. Control mappings are evidence summaries, never claims of certification. Scheduled reports use idempotent delivery jobs.
- `OUTSIDE_DATA_REGION` pins a deployment to one data region. Cross-region metadata relabeling is rejected; movement requires an explicit export/import migration. Operational retention is bounded and set-based; immutable audit history is deliberately not silently deleted.
- `terraform-provider-outside` manages enterprise workspace licensing and versioned policy documents. Destroying a workspace resource suspends its license instead of deleting customer evidence.

Enterprise secret material requires an independent `ENTERPRISE_ENCRYPTION_KEY`. Platform automation uses `ENTERPRISE_PROVISIONING_TOKEN`; do not reuse an end-user API token. SAML is accepted only through an audited SAML-to-OIDC broker boundary—OUTSIDE does not implement an unsafe bespoke XML signature parser. See [`docs/ENTERPRISE.md`](docs/ENTERPRISE.md).

## Deployment

Deploy to a Node.js host with PostgreSQL. Run migrations before starting the application:

```bash
npm ci
npm run db:migrate
npm run build
npm run start
```

The repository also ships separate production application and migration container targets:

```bash
docker build --target migrator -t outside-migrator .
docker run --rm --env DATABASE_URL outside-migrator migrate deploy
docker build -t outside .
docker run --read-only --tmpfs /tmp --env-file .env.production -p 3000:3000 outside
```

Supply secrets only at runtime; the build uses non-production sentinel values and does not require production credentials.

Configure the cron caller to send `Authorization: Bearer <CRON_SECRET>` to `/api/cron/scan`, `/api/cron/agency`, `/api/cron/enterprise`, and `/api/cron/retention`. Run the Agency job after monitoring to synchronize SLA state and enqueue deduplicated client-specific notifications. The Enterprise job claims integration deliveries, schedules exports, and applies operational retention. For portfolios over its bounded batch size, continue with the returned `nextCursor` as the `after` query parameter until it is `null`. Run retention at least daily; its advisory lock, bounded batches, and idempotent partition maintenance make overlapping invocations safe. Configure Stripe and Resend only when those optional capabilities are used. `/api/health` performs a real database readiness query in durable mode.

Paid deployments that enable Guardian workflow integrations must configure an independent 32-byte `GUARDIAN_ENCRYPTION_KEY`. Integration destinations are validated as HTTPS, resolved immediately before delivery, required to resolve exclusively to public IP addresses, and contacted through an IP-pinned connection with hostname verification.

Guardian history, immutable evidence snapshots, events, and activity use native monthly PostgreSQL range partitions. Paid organizations receive plan-aware retention defaults; organization administrators can manage bounded policy values through `/api/guardian/retention`. Evidence snapshots follow the snapshot retention window and reject database updates. Set an OTLP/HTTP metrics endpoint to export `outside.provider.duration`, `outside.guardian.queue.oldest_age`, queue depth, delivery outcomes, and retention throughput without tenant or domain labels.

## License

Proprietary.
