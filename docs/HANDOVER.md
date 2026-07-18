# Engineering handover

## Ownership map

- Discovery and SSRF boundary: `lib/discovery`, `lib/security/pinned-https.ts`.
- Deterministic scoring: `lib/analysis`; changes require golden tests and documented weights.
- Temporal history and evidence: `lib/persistence`, `lib/guardian`, Prisma partition migrations.
- Identity and tenancy: `lib/auth`, request access helpers, Agency and Enterprise access modules.
- Background work: monitoring, Guardian delivery, Enterprise operations, email outbox, cron routes.
- Commercial paths: billing, Agency Suite, Enterprise provisioning and Terraform provider.

## First-week checklist

Obtain production read-only access, secret-manager ownership, database/backup dashboards, Stripe and email consoles, provider accounts, CI administration, DNS/TLS ownership, incident contacts, and a list of contractual SLOs. Perform a restore drill and trace one scan, one Guardian delivery, one invite, and one billing webhook end to end.

## Change rules

- Never trust an organization or workspace identifier without deriving access from a session or scoped token.
- Never add an outbound request outside the public-IP validation and IP-pinned HTTPS boundary.
- Never let AI create evidence, findings, assets, scores, or remediation preconditions.
- Preserve insert-only evidence and audit semantics; migrations need rollback/forward-fix notes.
- Keep demo records under reserved `.example` domains and visibly labelled synthetic.
- Run unit, PostgreSQL integration, lint, strict typecheck, build, dependency audit, and Terraform tests before release.

Known operational and product limitations are tracked in [DUE_DILIGENCE.md](DUE_DILIGENCE.md), not hidden in sales copy.

