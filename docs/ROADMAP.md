# Capability status and future work

This file records the remaining product boundary. It is not a claim that planned functionality already exists.

## Implemented

- Passive CT/DNS discovery, verified-target HTTPS/TLS observation, typed SSE progress, deterministic evidence, findings, score, and recommendations.
- Deterministic known-vulnerability correlation of disclosed technology versions (Server / X-Powered-By) against a curated CVE / CISA-KEV / end-of-life set, feeding prioritized findings and the exposure score with explicit backporting caveats.
- PostgreSQL persistence for tenant-scoped targets, scans, temporal asset snapshots, changes, recommendation status, audit events, AI analyses, monitors, rate limits, webhook events, and email outbox state.
- Email/password accounts, Google OAuth when configured, email verification, organizations, RBAC, hashed/expiring invites, DNS and well-known-file domain verification.
- Atomic scheduled-monitor claims, retry backoff, alerts, PDF reports, Stripe subscriptions, and optional read-only OpenAI explanations.
- Responsive canvas graph with Barnes-Hut repulsion, stale-object reconciliation, viewport culling, and idle/visibility suspension.
- A connector credential registry and validated remediation proposal previews.
- OUTSIDE Guardian continuous snapshots, semantic event correlation, Exposure Drift, living SPF/DKIM/DMARC/DNSSEC/HSTS/HTTPS/security.txt/MTA-STS/TLS checklist, evidence-backed recommendations, provider-tailored remediation guides, grouped email/workflow notifications, retryable delivery history, and weekly executive digests.
- Guardian monthly PostgreSQL partitioning, plan-aware per-tenant retention, bounded cleanup, OTLP metrics for provider and queue operations, and PostgreSQL integration workflows in CI.
- Guardian Evidence Intelligence with immutable hashed snapshots, raw/normalized viewers, provider and entity-resolution provenance, multi-source correlation, contradiction and evidence-gap detection, trace graphs, and DNS/certificate/HTTP/technology histories.
- Agency Suite portfolio workflows, client portal, white-label reporting, SLA routing, billing hierarchy, scoped Agency API, and Agency RBAC.
- Isolated Enterprise control plane with OIDC, brokered SAML, SCIM, scoped RBAC, hierarchy and ownership, approvals, policies, exceptions, API tokens, persisted GraphQL operations, integrations, compliance exports, feature and licence controls, and a Terraform provider.
- Per-response nonce CSP, same-origin browser mutation enforcement, production `__Host-` sessions, bounded request bodies, explicit liveness/readiness probes, structured operational logs, and PII-free funnel telemetry.

## Not implemented

- Provider-side remediation execution, post-change verification, or automated rollback. Connector credentials currently enable registry state only.
- A side-by-side historical graph-diff interface; the current UI provides score history and new/returned overlays.
- Native SAML XML processing, enforced MFA, device inventory, and organization-wide session administration. SAML currently uses a deliberate SAML-to-OIDC broker boundary.
- Multi-region job routing, dedicated worker processes, or provider-specific circuit breakers for very large fleets.
- A complete operator observability package. OTLP metrics and structured operational logs are available, but dashboards, alert policies, distributed tracing, and SLO ownership depend on the deployment platform.
- Automated PostgreSQL backup/restore validation and disaster-recovery orchestration.
- A live vulnerability feed. Known-vulnerability correlation currently uses a curated, offline seed set; a scheduled NVD + CISA-KEV sync would slot in behind the same version matcher without changing the finding shape.

## Recommended next investments

1. Build deployment-specific OpenTelemetry dashboards and alerts for scan failures, queue age, cron lease recovery, rate-limit pressure, and service-level objectives.
2. Add a reviewed connector adapter contract with least-privilege credentials, immutable previews, explicit approval, post-condition verification, and tested rollback before enabling any provider mutation.
3. Extend PostgreSQL integration coverage with browser end-to-end tests for authentication, verification, history, billing, and monitor user journeys.
4. Add side-by-side historical graph comparison and large-surface clustering/level-of-detail rendering.
5. Add enterprise session controls and MFA, then make remaining specialized Enterprise mutations transactionally atomic with their audit entries.
