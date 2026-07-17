# First-customer launch guide

## What customers must understand

OUTSIDE maps publicly observable external infrastructure and monitors deterministic changes for domains the organization is authorized to assess. It is defensive external-surface intelligence, not exploitation, penetration testing, an internal vulnerability scanner, or proof that an observed service is vulnerable.

Observations are facts returned by named sources. Inferences and possible risks are labelled separately. Confidence explains source agreement and limitations; missing or contradictory evidence remains visible. Provider failure means incomplete observation, not a passing control. Demo data is synthetic and never mixed with customer history.

## Onboarding checklist

1. Confirm the customer's authorized domains, data region, retention expectation, users/roles, support contact and notification destinations.
2. Create the organization from the canonical HTTPS product origin and verify the email address.
3. Add one domain and complete DNS TXT or well-known-file ownership verification.
4. Explain that verification authorizes bounded active HTTPS/TLS observation but no exploitation.
5. Run the first scan; review provider status before interpreting assets or findings.
6. Open one finding and trace evidence, confidence, contradictory/missing signals and remediation guidance.
7. Enable Guardian only after notification recipients and cadence are agreed.
8. Send a staging/test notification and confirm failure visibility.
9. Invite team members using least privilege.
10. Demonstrate export, report-share revocation, retention and offboarding requests.

## First-scan guidance

- Start with a well-understood corporate domain, not a newly acquired or disputed name.
- Asset discovery can be incomplete because public sources, DNS, certificates and provider availability vary.
- A staging/auth/API label is a review signal, not a vulnerability.
- Confirm ownership and business purpose before resolving or escalating a finding.
- Report false positives with the affected domain, scan ID, finding/evidence ID, expected interpretation and permission to investigate. Do not email secrets or raw integration credentials.

## Guardian and integrations

Guardian creates a deterministic snapshot after eligible scans and correlates meaningful changes over time. A no-change run is a valid result. Notifications are grouped and deduplicated; repeated provider failure remains visible. Reconnect revoked/undecryptable credentials through the settings flow.

Enable only destinations approved by the customer. Test delivery, receiver permissions, revocation and retry visibility before relying on a channel. Ticket delivery does not transfer finding ownership unless the customer process says so.

## Support and incidents

Before the pilot, publish:

- support address and service hours;
- security/vulnerability address;
- incident intake fields and severity definitions;
- status page or status communication channel;
- planned-maintenance and customer-notification process;
- data export/deletion and offboarding request process.

For a suspected tenant isolation, secret exposure, unauthorized scan or billing incident, preserve the time, user, organization, request/scan/event IDs and observed behaviour, then follow `docs/INCIDENT_RESPONSE.md`. Do not ask customers to send passwords, tokens or encryption keys.

## Offboarding

Confirm requester authority; export agreed data; revoke sessions, API keys, invites, share grants and integrations; stop monitors and scheduled delivery; reconcile billing; apply the approved retention/deletion policy; record backup-expiry limitations; and provide written completion evidence. Immutable audit history requires the legal/contractual archive policy rather than silent deletion.
