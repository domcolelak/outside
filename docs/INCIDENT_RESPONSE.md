# Incident response

## Roles and severity

Assign an incident commander, technical lead, communications owner, and scribe. Treat suspected cross-tenant access, signing/encryption-key exposure, unauthorized provider delivery, billing corruption, or audit-chain failure as critical until disproved.

## Response sequence

1. Record the start time, affected deployment, commit, region, organizations, and evidence source.
2. Contain with the narrowest reversible action: revoke a token, rotate a destination secret, disable one integration, or remove an instance from traffic. Avoid destructive database changes.
3. Preserve database snapshots, immutable audit exports, application logs, provider run records, and relevant external-provider events. Hash exported evidence.
4. Determine the authorization path, data accessed or changed, dwell time, and whether another tenant was reachable.
5. Eradicate the cause, add a regression test, rotate affected secrets, and deploy through the normal release gate.
6. Recover from a known-good state, verify audit-chain integrity and queue idempotency, then monitor for recurrence.
7. Complete customer/regulatory notification with counsel and contractual owners. Publish a blameless post-incident review with dated actions.

Never place secrets, raw invitation tokens, session cookies, report-share tokens, or customer evidence in chat or ticket systems. The repository defines controls but does not supply an on-call vendor, legal process, or notification SLA; the operating company must own those before launch.

