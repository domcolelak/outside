# Launch validation record

This file defines the evidence contract. It must not be edited to claim success; attach machine-generated workflow artifacts and external operator records to the release.

## Evidence sources

- `CI`: unit, strict type, lint, build, PostgreSQL workflows, migration upgrade, logical restore compatibility, browser flows, production container, and Terraform provider.
- `Release candidate artifact`: exact commit, build time, schema head, application/migrator image IDs, Terraform version, checksums, and verified-CI link.
- `Production-like launch validation`: ephemeral Compose staging, HTTPS, monitoring, interruption/recovery, encrypted backup/restore, wrong-key rejection, restored startup, and measured probes.
- `External staging record`: public hostname/TLS, managed PostgreSQL/PITR, real providers, authorized domains, alert receiver, and operator timestamps.

## Required status vocabulary

- `validated`: evidence from the exact release commit is attached.
- `failed`: executed and did not meet the expected behaviour.
- `not executed`: no evidence exists.
- `external`: cannot be established by repository automation alone.
- `provisional`: measured only in ephemeral staging or insufficient traffic.

## Launch matrix

| Area | Repository-controlled evidence | External evidence required before paying customers |
|---|---|---|
| Build and migrations | Green CI plus release manifest for exact commit | Deployment platform runs the same migrator against an isolated restore |
| HTTPS and headers | Ephemeral Caddy/browser/blackbox evidence | Trusted public certificate, DNS, edge configuration and expiry alert |
| Authentication/tenancy | Browser and PostgreSQL isolation workflows | Test accounts exercise deployed hostname; independent pentest |
| Discovery/Guardian | Deterministic unit/PostgreSQL workflows and interrupted lease recovery | Authorized real domains, provider credentials/limits, outage drill and quality review |
| Agency Suite | PostgreSQL and browser access workflows | Real agency/client role matrix and white-label delivery |
| Billing | Signature, ordering, idempotency and entitlement tests | Stripe test-mode checkout/failure/replay/delay/cancel flow |
| Integrations | Payload, SSRF, encryption, retry and idempotency tests | Real staging delivery and revocation for each enabled provider |
| Observability | Config validation, metrics collection, alert routing to staging sink | On-call receiver, paging test and named human owner |
| Backup/recovery | Encrypted logical dump, clean restore, wrong-key rejection, restored app startup | Managed PITR, off-account copy, measured RPO/RTO and regional evidence |
| Performance | Ephemeral runner latency/resource artifact | Representative fleet load, provider quotas and 30-day SLO history |
| Security/legal | Internal controls and pentest package | Independent penetration test and counsel-approved legal package |

No launch gate is passed by documentation alone.
