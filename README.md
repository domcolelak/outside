# OUTSIDE

OUTSIDE is a defensive external-surface discovery and monitoring application. It maps public evidence for a domain, streams the scan as an interactive graph, derives deterministic findings and an exposure score, and tracks change for verified organizations.

OUTSIDE Guardian is the premium continuous-intelligence subsystem. It retains normalized observations, correlates meaningful changes across time, calculates Exposure Drift, maintains a living security checklist, produces evidence-backed recommendations and remediation guides, groups workflow notifications, and generates weekly executive digests. Guardian never creates assets, weaknesses, or evidence that the deterministic discovery pipeline did not observe.

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
```

## Validation

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

CI runs the same gates. Dependency update pull requests are configured through Dependabot.

## Architecture

The core pipeline is:

```text
request -> authorization/rate limits -> discovery providers -> normalization
        -> graph/evidence -> signals/findings/score -> persistence -> SSE/UI
```

Key areas:

- `app/api`: authenticated API boundaries, SSE scans, cron, billing, and webhooks.
- `lib/discovery`: bounded CT, DNS, and verified-target HTTPS/TLS observation.
- `lib/security`: target validation, IP pinning, request limits, and distributed rate controls.
- `lib/analysis`: deterministic classification, finding generation, and scoring.
- `lib/persistence`: tenant-scoped temporal identity, snapshots, diffs, and history.
- `lib/monitoring`: atomic monitor claims, retry/backoff, and scheduled scans.
- `lib/aegis`: recommendations, proposal validation, status, and audit trail.
- `lib/guardian`: continuous snapshots, event correlation, Exposure Drift, checklist controls, recommendation/remediation generation, encrypted integrations, retryable delivery, and executive digests.
- `lib/auth`: signed sessions, RBAC, invites, OAuth, and email verification.
- `lib/email`: durable outbox, templates, provider deadlines, and alerts.
- `components/graph`: canvas graph with Barnes-Hut scaling, reconciliation, culling, and idle suspension.
- `prisma/schema.prisma`: durable multi-tenant data model.

The complete design and operational trade-offs are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Current limitations and future work are in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Security model

- Organization IDs are derived from authenticated memberships, not trusted from the client.
- Targets, verification records, scans, history, recommendations, and monitors are organization-scoped.
- Outbound HTTPS resolves and validates every address, rejects special-use IPv4/IPv6 space, and connects to a validated IP with hostname verification to prevent DNS rebinding.
- Session and verification signing keys are mandatory and independent in production, with controlled session-secret rotation.
- Invite tokens are random, stored as hashes, bound to the invited email, expire, and are consumed atomically.
- Shared database-backed rate limits, concurrency leases, cron claims, webhook idempotency, and email delivery state support multi-instance deployments.
- Provider bodies are bounded by bytes, content types are checked, deadlines are enforced, and errors returned to clients are sanitized.

This is defensive discovery software. It intentionally contains no exploitation, credential attack, brute-force, or payload capability.

## Deployment

Deploy to a Node.js host with PostgreSQL. Run migrations before starting the application:

```bash
npm ci
npm run db:migrate
npm run build
npm run start
```

Configure the cron caller to send `Authorization: Bearer <CRON_SECRET>` to `/api/cron/scan`. Configure Stripe and Resend only when those optional capabilities are used. `/api/health` performs a real database readiness query in durable mode.

Paid deployments that enable Guardian workflow integrations must configure an independent 32-byte `GUARDIAN_ENCRYPTION_KEY`. Integration destinations are validated as HTTPS, resolved immediately before delivery, required to resolve exclusively to public IP addresses, and contacted through an IP-pinned connection with hostname verification.

## License

Proprietary.
