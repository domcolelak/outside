# Privacy and data handling

This document describes product behavior, not legal advice or a claim of compliance. The deploying organization remains responsible for its notices, lawful basis, contracts, regional configuration, and subprocessors.

## Data categories and purpose

- Account identity, organization membership, sessions, invitations, and permissions support authentication and access control.
- Domain verification proves authority for active observation and durable monitoring.
- Public DNS, certificate-transparency, RDAP, HTTPS, TLS, header, redirect, and technology observations support external-surface discovery. Raw and normalized evidence may contain public hostnames, IP addresses, certificates, response metadata, and provider errors.
- Guardian snapshots, findings, recommendations, notifications, and reports preserve deterministic history and explain changes.
- Agency and Enterprise records contain client relationships, analyst notes, ownership, policies, audit metadata, integration delivery state, and billing allocation.
- Operational logs and metrics support security, reliability, capacity planning, and incident response. Metrics deliberately avoid domain and tenant labels; structured logs can still contain pseudonymous operational identifiers.

OUTSIDE does not collect payment-card data. Stripe hosts payment entry and sends signed billing events. Passwords are stored only as salted password hashes; reset, invite, session, and API-token secrets are stored as hashes or signed values as appropriate.

## Storage, recipients, and regional controls

Primary application data is stored in the operator-provided PostgreSQL deployment and region. `OUTSIDE_DATA_REGION` prevents accidental metadata relabeling but does not move or geographically constrain databases, backups, logs, email, metrics, or third-party providers.

Data is sent to a provider only when that capability is configured:

- Resend receives recipient and transactional email content.
- Stripe receives billing identity and subscription data.
- Configured notification, ticketing, SIEM, SOAR, or webhook destinations receive the selected event payload.
- The optional AI provider receives only the bounded interpretation input selected by the application. AI is not an evidence source and cannot mutate evidence or scoring. Operators must assess whether enabling it is appropriate for their data policy.
- Public discovery providers receive the domain or public lookup required for the observation.

Maintain an operator-controlled subprocessor register containing legal entity, service, region, purpose, retention, and contract owner. Repository documentation cannot establish the operator's actual subprocessor list.

## Retention, export, and deletion

Guardian and operational retention is organization-scoped and bounded by configured policy. Evidence snapshots follow snapshot retention. Email outbox, usage events, webhook idempotency records, Enterprise delivery records, and ticket links are removed by the authenticated retention job after their configured windows.

Enterprise audit records are immutable and are not silently deleted. A customer-specific archive/deletion procedure must reconcile contractual retention, security evidence, and applicable law before destructive action. Database backups expire according to the infrastructure policy and are not directly modified by application deletion.

Authorized users can export reports, audit events, and relevant portfolio data. Public report links are random, hashed, tenant-scoped, expiring grants and can be revoked. Tenant offboarding must revoke sessions, API keys, invites, share grants, integrations, and scheduler work before deletion or archive.

## Required operator controls

- Publish an accurate privacy notice and contact channel before accepting real users.
- Define retention periods, deletion approval, legal hold, export identity verification, and backup expiry.
- Restrict database, backup, log, metrics, and support access; log privileged access.
- Document cross-border transfers and regional placement for every configured provider.
- Never describe OUTSIDE as GDPR, SOC 2, ISO 27001, NIS2, or DORA compliant solely because it provides supporting controls or exports.

