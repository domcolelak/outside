# Security model and responsible use

OUTSIDE is a defensive product for understanding an organization’s public digital footprint. Exploitation, credential attacks, payload delivery, persistence, and unauthorized-access features are explicit non-goals.

## Discovery boundary

- Anonymous and unverified scans use public Certificate Transparency and DNS-over-HTTPS data only.
- A bounded HTTPS/TLS observation is enabled only for a signed-in organization that completed domain ownership verification.
- Work is capped by per-scan deadlines, provider timeouts, response-byte limits, host limits, shared rate limits, and global/target concurrency leases.
- Client disconnects abort provider work. Provider failures are isolated and reported in `providerRuns`.

## SSRF and egress controls

All target input passes through `lib/security/target.ts`. Targets must be public DNS names; IP literals and reserved/internal TLDs are rejected. Resolved IPv4 and IPv6 addresses are checked against private, loopback, link-local, carrier-grade NAT, documentation, transition, multicast, and reserved ranges.

Active observation and file verification resolve once through the configured DoH provider, reject every non-global address, and connect directly to a validated IP while preserving Host and SNI. Redirects are refused and response bodies are capped. This prevents DNS rebinding between validation and connection.

## Authorization and abuse controls

- Tenant-owned state uses organization keys and a single verified-target authorization policy.
- Domain verification requires organization-admin access; an existing claim cannot be rebound.
- Recommendation changes require analyst access and audit records never become public.
- Monitoring requires verified ownership by the same organization.
- Production rate limits are stored in PostgreSQL and cover global, client, user, organization, recipient, target, usage, and concurrency dimensions. Development memory buckets are swept and capped.
- Invite senders and recipients must verify their account email. Invite tokens are hashed, expiring, email-bound, revocable, and atomically consumed.

## AI and report boundary

AI and PDF endpoints require authenticated, verified target access. Paid AI calls additionally require a paid organization plan. Bodies are rejected at the byte boundary before buffering, then projected through bounded schemas. Usage is persisted and expensive work has shared concurrency leases. AI output remains separate from deterministic facts and scoring.

## Operations

Production fails readiness without a durable database unless an operator explicitly selects ephemeral demo storage. The health endpoint executes a real database query. Cron work uses atomic leases and deterministic run IDs; Stripe event markers commit in the same transaction as subscription changes.

Security headers are configured in `next.config.mjs`. Secrets are never logged. Rotate `AUTH_SECRET` by setting the new value and temporarily listing old values in `AUTH_SECRET_PREVIOUS`.
