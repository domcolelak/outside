# Architecture

## System shape

OUTSIDE is a modular monolith: one Next.js 15 App Router application, one PostgreSQL database through a process-wide Prisma client, and optional external providers. This keeps transactions and authorization inside one trust boundary while preserving clear module seams.

```text
Browser
  |-- pages and canvas graph
  |-- EventSource scan stream
  v
Next.js route handlers
  |-- authentication, tenant authorization, entitlements
  |-- byte limits, validation, rate and concurrency controls
  v
Discovery -> deterministic analysis -> tenant persistence
  |              |                       |
  |              +-> optional AI text    +-> history / monitors / outbox
  +-> CT / DoH / verified HTTPS
```

## Request and trust boundaries

Anonymous users may request a bounded passive snapshot. Anonymous results are ephemeral. Authenticated functionality resolves organization access from the signed user session and database memberships. A client-supplied organization identifier is always checked against that context.

Domain verification is scoped to an organization. Active HTTPS/TLS observation is allowed only after verification and is limited to a small configurable host set with bounded concurrency. DNS and file challenges bind the token, organization, target, expiry, and verification method. The HTTPS connector validates all resolved addresses and connects to a pinned public address while preserving SNI and certificate hostname checks.

## Discovery and analysis

`lib/discovery/engine.ts` orchestrates a typed stage sequence shared by server and client. CT and DNS providers use bounded responses, deadlines, structured `ProviderRun` telemetry, and partial-success semantics. Public CNAME suffixes provide explicit cloud/CDN signals; verified HTTPS responses add bounded literal Server/X-Powered-By technologies and recognized provider-header evidence. These remain observable signals rather than ownership claims. The maintained Public Suffix List supplies registrable-domain boundaries.

Observations become canonical `Asset` and `Edge` objects. Analysis remains deterministic:

1. signal classification separates facts from inference;
2. scoring sums explicit components to a 0-100 result;
3. findings retain evidence, assurance, and confidence;
4. recommendations reference those same score components;
5. optional AI only explains the finalized structure.

## Persistence and tenancy

PostgreSQL is mandatory in production. Explicit memory stores exist for development and deterministic tests only. `lib/db/prisma.ts` owns the singleton Prisma client.

Organizations own targets, verification records, scans, monitors, recommendations, audit records, AI analyses, and delivery state. Composite tenant keys prevent two organizations that monitor the same domain from sharing state. Scan records also carry `orgId`, so history queries never infer tenancy indirectly.

Temporal persistence separates stable `AssetIdentity` rows from per-scan `AssetSnapshot` rows. `certKey` is durable. Consecutive snapshots generate new, returned, disappeared, technology, priority, and certificate change events. The system preserves the earliest observed timestamp rather than replacing it with later CT evidence.

## Guardian continuous intelligence

Guardian is a premium subsystem layered on the same verified discovery pipeline. It does not run a second scanner. Each paid-organization scan produces a full normalized `GuardianSnapshot` containing the current inventory, checklist evidence, and aggregate metrics. Correlation compares consecutive observations and longer presence history to distinguish a new asset from a returning or flapping asset, detect exact DNS/mail/certificate/redirect/provider transitions, and emit expiry milestones only when thresholds are crossed.

Exposure Drift compares the latest observation with a factual monthly baseline across asset count, shadow signals, identity/API surfaces, non-production exposure, technology diversity, provider complexity, checklist posture, and exposure score. Recommendations are deterministic projections of actionable checklist states or correlated events. Every recommendation retains evidence, confidence, reasoning, affected assets, suggested review, business impact, and provider-aware remediation guides. AI is not in this decision path.

Evidence Intelligence is the explainability boundary between discovery and findings. Every persisted scan creates an insert-only `GuardianEvidenceSnapshot` containing bounded raw observations, normalized attribute records, provider runs, discovery paths, provenance, and entity-resolution decisions. Canonical serialization and SHA-256 hashes seal both individual records and the complete snapshot; PostgreSQL rejects updates to evidence rows. Finding explanations are derived on read from these snapshots: source-weighted evidence scores, provider reliability, multi-source correlations, contradictions, explicit evidence gaps, a trace graph, and DNS/certificate/HTTP/technology histories. The engine retains conflicting values instead of selecting one and caps its calculated confidence at the deterministic finding confidence.

Guardian notification records form a durable outbox with atomic `SKIP LOCKED` claims, leases, bounded exponential retries, delivery history, and five-attempt terminal failure. High-severity events notify immediately; medium events require a related group of at least three. Channel credentials are encrypted with AES-256-GCM under an independent key. Slack, Teams, Discord, generic webhooks, Jira, GitHub Issues, and Linear requests resolve destinations immediately before each request, reject any special-use address, and pin HTTPS to the validated IP to prevent DNS rebinding. Weekly digests are unique by organization, target, and ISO week.

Large-fleet history is split into native monthly range partitions for Guardian snapshots, immutable evidence snapshots, correlated events, and activity. A default partition preserves writes during scheduler outages, while an advisory-locked maintenance function creates future partitions idempotently. Per-organization, plan-aware retention cutoffs are applied by fleet-wide set-based deletes with global `SKIP LOCKED` batch limits, so work remains bounded independently of tenant count. Base scans are retained independently and never for less time than their Guardian snapshots.

## Agency Suite control plane

Agency Suite is additive to the organization boundary:

1. `Organization` remains the owner of targets, verifications, scans, Guardian evidence, channels, and billing subscription.
2. `AgencyWorkspace` owns portfolio configuration, branding, seats, reseller hierarchy, and API keys.
3. `AgencyClient` is an owner-approved relationship to an organization. Cross-customer reads first resolve this relationship and then query the existing organization-keyed Guardian store.
4. `AgencyMembership` provides independent agency RBAC. It never creates an organization membership implicitly.
5. Client portal grants are email-bound, hashed, expiring invitations. Portal responses include only shared recommendations, shared notes, posture summaries, and deterministic changes.

Portfolio health derives from current exposure scores, unresolved recommendation priorities, observation freshness, and configured SLA windows. No AI-generated value participates in authorization, evidence, scoring, or SLA status.

Bulk scan requests are idempotent and only reschedule existing verified monitors. Bulk executive reports are job results built from current Guardian observations. The agency API accepts session authorization or hashed bearer keys with explicit scopes; secret material is shown only at key creation.

White-label custom domains reuse the existing domain-verification record. Reseller parents require an owner session with administrative access to both workspaces and direct cycle checks. Database constraints enforce unique workspace owners, client relationships, API secrets, finding shares, and job idempotency keys.

## Background and external work

The cron route uses database claims with leases and `SKIP LOCKED`, bounded worker concurrency, deterministic run identifiers, and retry backoff. A crashed worker's lease can be reclaimed. Monitor creation serializes quota enforcement and duplicate checks.

## Enterprise isolation

`EnterpriseWorkspace` is a one-to-one licensed control plane beside—not inside—the SMB plan model. Every enterprise row carries `workspaceId`; access first resolves a normal organization membership or a hashed enterprise token, then evaluates the enterprise license, regional deployment, feature entitlement, permission binding and optional resource scope. Organization owners bootstrap the control plane, while all delegated access flows through versioned roles and user/group/service bindings.

Enterprise identity configuration and integration credentials use a separate AES-256-GCM key. Native OIDC validates state, nonce, issuer, audience, lifetime, algorithm and JWKS signature. SAML terminates at an audited SAML-to-OIDC broker boundary; the application never parses arbitrary XML signatures. SCIM tokens are provider-scoped hashes. Deprovisioning disables the organization membership and increments the user session version.

The enterprise audit stream is serialized with a per-workspace PostgreSQL advisory transaction lock. Each append hashes the previous hash, sequence, timestamp, actor, action, resource, request metadata and canonical detail. A database trigger rejects updates and deletes. Complete exports re-verify the chain and fail closed if the bounded export would be incomplete.

SIEM, SOAR, ticket and webhook events use a durable idempotent outbox with `SKIP LOCKED` claims, leases, eight bounded retries and dead-letter state. Every destination is resolved immediately before delivery, must resolve only to public addresses, and is contacted through an IP-pinned TLS connection preserving hostname validation. OpenTelemetry reports queue age and provider latency without tenant identifiers. Regional deployments set `OUTSIDE_DATA_REGION`; authorization refuses workspaces assigned elsewhere.

Stripe webhooks verify signatures and commit event idempotency plus subscription state in one transaction. The email outbox stores idempotency keys, atomically claims work, applies provider timeouts, and retries with bounded exponential backoff. Rate limits and expensive-operation concurrency leases are also database-backed in durable mode.

## UI and graph

The client consumes typed SSE events. A shared stage catalog prevents server/client progress drift. The graph reconciles removed nodes and edges, uses direct repulsion for small surfaces and Barnes-Hut for larger ones, culls offscreen geometry, and suspends simulation when settled or hidden.

## Failure behavior

- Production configuration errors fail startup or the affected capability closed.
- Provider failures become sanitized partial results; secrets and raw internal errors are not returned.
- Persistence failures in durable workflows are propagated rather than silently switching to memory.
- Optional AI, email, OAuth, and billing are env-gated; their absence does not alter deterministic discovery.
- Health checks query the database instead of reporting process liveness alone.

## Operations

Run schema migrations before application startup. CI executes unit tests, lint, strict type checking, production build, a production dependency audit, and PostgreSQL 16 workflow tests against the deployed migration chain. Query logging is opt-in. Provider-run and scan IDs support correlation. Optional OTLP/HTTP export reports provider latency/observations, Guardian queue depth/oldest-ready age, delivery outcomes, and retention throughput using bounded low-cardinality attributes; tenant identifiers and domains are deliberately excluded.

The connector registry is descriptive. It maps credentials and recommendation categories but does not implement provider mutations. Remediation proposals remain preview-only until a separately reviewed execution adapter exists.
