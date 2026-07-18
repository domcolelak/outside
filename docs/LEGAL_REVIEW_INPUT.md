# Technical input for legal review

This is an engineering inventory, not legal advice or a compliance claim. Counsel and the operator must verify the deployed configuration, contracts, notices and jurisdictions.

## Data inventory and flows

| Category | Examples | Source | Primary destination | Optional recipients |
|---|---|---|---|---|
| Account and access | name, email, password hash, memberships, invitations, session version, roles | customer users | PostgreSQL | email/OIDC provider |
| Customer configuration | organizations, authorized domains, monitors, branding, notes, policies, retention | customer users/admins | PostgreSQL | configured reports/integrations |
| Public internet observations | DNS, CT, certificates, public hostnames/IPs, redirects, bounded HTTP/TLS/header/technology metadata, provider errors | public providers and verified domains | PostgreSQL evidence/history | configured reports, notifications, optional AI |
| Security interpretation | deterministic assets, findings, score components, confidence, contradictions, recommendations | OUTSIDE deterministic engine | PostgreSQL | reports/integrations |
| Agency/Enterprise | client relationships, ownership, SLA, API/audit/integration delivery state | customer/agency | PostgreSQL | selected integration providers |
| Billing | Stripe customer/subscription identifiers and signed event state; no card data | Stripe/customer | PostgreSQL and Stripe | accounting/support systems chosen by operator |
| Operations | bounded structured logs, low-cardinality metrics, request/scan/provider IDs, resource data | application/infrastructure | operator logging/metrics systems | operator on-call provider |
| Support/pilot | customer-submitted feedback, support correspondence and operator notes | customer/operator | approved support system | assigned support staff |

Passwords are salted hashes. Reset, invitation, API-token and public-share secrets are stored as hashes or signed tokens as appropriate. Guardian/Enterprise integration credentials are AES-256-GCM encrypted. Encryption keys and database passwords are external secret-manager data and are not recoverable from a database backup.

## Retention, export and deletion

Guardian and operational retention are bounded and organization-scoped. Evidence follows snapshot retention. Email, usage, idempotency and delivery records use configured operational windows. Enterprise audit history is append-only and is not silently deleted.

The operator must approve specific retention periods, legal-hold handling, export identity verification, deletion workflow, backup expiry and audit archive. Deleting primary rows does not rewrite immutable backups; notices must state the backup expiry policy accurately.

## Regions and subprocessors

`OUTSIDE_DATA_REGION` is an authorization guard, not physical residency. Actual regions include PostgreSQL, backups, object/report storage, application compute, logs, metrics, email, billing, AI and every enabled integration. Maintain a verified subprocessor register with legal entity, purpose, data categories, region, retention, transfer mechanism, contract owner and change-notice process.

Likely configured recipients include the hosting/database/backup/observability vendors, Resend, Stripe, OIDC provider, optional AI provider, and customer-selected Slack/Teams/Discord/webhook/ticket/SIEM/SOAR providers. The repository cannot identify which are actually enabled.

## Public links, cookies and analytics

Public report grants are random, hashed, tenant-scoped, expiring and revocable; recipients may still download or redistribute content. Authentication uses necessary secure cookies. Product funnel telemetry is designed without tenant/domain metric labels, but the operator must inventory the actual analytics, cookie, log and support configuration before publishing a notice.

## Claims requiring counsel or independent evidence

Do not publish claims of GDPR, SOC 2, ISO 27001, NIS2, DORA, HIPAA, PCI DSS, data residency, continuous availability, guaranteed discovery coverage, vulnerability detection, penetration testing equivalence, or specific RPO/RTO based only on repository controls.

External review checklist:

- privacy policy, terms of service and acceptable-use policy;
- data-processing agreement and subprocessor list;
- cookie/analytics notice and consent requirements;
- customer authorization and acceptable scope for monitored domains;
- regional hosting and international-transfer claims;
- retention, deletion, legal hold and audit archive;
- breach-notification obligations and incident contacts;
- payment, cancellation, refunds, trial and reseller terms;
- security marketing claims, SLO language and limitation of liability;
- AI-provider terms, training/retention settings and opt-in/disable behaviour;
- status page, vulnerability disclosure and law-enforcement request process.
