# Controlled pilot operations

Keep pilot operations small and outside customer authorization paths. Do not give support personnel database access merely to track feedback.

## Pilot registry

Maintain an access-controlled operator registry outside the product database containing:

- organization ID and display name;
- pilot start/end, plan and agreed limits;
- authorized domains and written authorization owner;
- onboarding stage and last successful scan;
- customer technical/executive contacts;
- assigned support and security owners;
- enabled integrations and test status;
- open operational issues and next review;
- data region, retention and offboarding date.

Organization IDs are identifiers, not credentials. Do not place secrets, evidence bodies or customer notes in issue labels, analytics properties, metrics or alert labels.

## Feedback intake

Use the published support channel and a tenant-restricted form or helpdesk. Required fields:

- organization and user identity from the authenticated/support context;
- category: onboarding, scan quality, finding interpretation, false positive, missing asset, Guardian, report, integration, billing, accessibility or operational;
- scan/finding/evidence ID where applicable;
- expected vs observed behaviour;
- impact and urgency;
- consent to inspect the referenced tenant data;
- reproducible timestamps and screenshots with secrets removed.

Track status, owner, customer response and resolution. Internal support notes remain in the approved support system and are never exposed through client portals. Agency analyst notes are product records for agency workflows; they are not a substitute for operator support records.

## Telemetry

Use existing PII-free funnel events, request/scan/queue/provider/report metrics and audit records to measure onboarding completion, first scan, Guardian activation, invite/report actions and operational health. Join them to the pilot registry only in an access-controlled analytics system. Do not add domains, emails, organization IDs or finding text to metrics.

Review weekly:

- onboarding and first-use completion;
- scan success, provider limitations and uncertain/missing evidence;
- confirmed false positives/negatives with deterministic cause;
- queue age, notification failures and resource headroom;
- feature usage without content inspection;
- support volume, time to response and unresolved security concerns;
- SLO breaches and backup/restore status.

## Launch controls

- Limit the number of organizations to the support and on-call capacity actually available.
- Assign a human owner for every alert and pilot customer.
- Keep demo organizations visibly synthetic and isolated.
- Use test-mode billing until cancellation, failure and replay have been validated in deployed staging.
- Pause onboarding after a tenant-boundary concern, unrecoverable data-loss event, billing integrity failure, or unresolved critical alert.
- Obtain explicit approval before using customer domains for external discovery.

This minimal process intentionally avoids adding a second customer-success database or privileged operator backdoor to OUTSIDE.
