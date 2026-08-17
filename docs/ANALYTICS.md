# Audience and funnel analytics

OUTSIDE runs a private, self-hosted Umami 3 instance for audience, campaign and product-funnel measurement. It is isolated from the customer database and is disabled automatically when `UMAMI_WEBSITE_ID` is absent or malformed.

## What is measured

- Pageviews, visits, unique visitors, bounce rate, visit duration, entry/exit pages and referrer origin.
- Browser, operating system, device type, screen, language and approximate country.
- Validated `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term` campaign codes.
- PII-free funnel events: scan/demo start and completion, sign-up start/completion, email verification, domain verification, Guardian view, checkout start/completion, invitations, report actions and Agency creation.

No analytics event may contain a name, email, organization/customer identifier, assessed domain, hostname, finding, note, question, report/invitation/reset token, integration credential or other secret. Query strings and fragments are removed before collection. `/r/*`, `/invite/*` and `/reset-password` are excluded completely. The tracker uses no cookies or local storage and respects Do Not Track.

## Campaign links

Use stable lowercase codes so the same campaign is not split into several rows:

```text
https://outsideguardian.eu/?utm_source=linkedin&utm_medium=organic&utm_campaign=founder_sale_2026
https://outsideguardian.eu/?utm_source=facebook&utm_medium=group&utm_campaign=first_customers_2026
https://outsideguardian.eu/pricing?utm_source=google&utm_medium=cpc&utm_campaign=security_monitoring_sk
```

Do not place email addresses, contact names or buyer/customer IDs in UTM values.

## Reading the first-client funnel

Use this order when evaluating acquisition:

1. `unique visitors` and `campaign_visit` show how many people arrived and from where;
2. `scan_started` → `scan_completed` shows whether the free proof is understood and usable;
3. `signup_started` → `signup_completed` → `email_verified` shows account activation friction;
4. `verification_started` → `domain_verified` → `guardian_viewed` shows time to real product value;
5. `checkout_started` → `checkout_completed` shows paid conversion.

Compare conversion rates by one UTM campaign at a time. Do not optimize from very small samples; review failed scans and product errors beside funnel drop-off before changing copy or buying more traffic.

## Private operator access

The dashboard is bound to `127.0.0.1:${UMAMI_PORT:-3002}` on the server and is intentionally not routed through the public domain. Open an SSH tunnel from the operator machine:

```bash
ssh -L 3002:127.0.0.1:3002 <deployment-user>@<server-address>
```

Then open `http://127.0.0.1:3002` and sign in as `admin` with the value stored in `UMAMI_ADMIN_PASSWORD`. Do not expose port 3002 publicly. To rotate the password, move the old value to `UMAMI_ADMIN_PASSWORD_PREVIOUS`, set a new 16+ character value, deploy once, verify login, then clear the previous value.

## Operations and privacy

- Umami, its PostgreSQL database and its encrypted backups have separate services/volumes from OUTSIDE customer data.
- Only `GET/HEAD /insights.js` and `POST /api/insights` are routed publicly. Login, dashboard, website and reporting APIs remain private.
- `PRIVATE_MODE`, upstream telemetry and update checks are disabled; upgrades are explicit and image-digest pinned.
- Sessions and dependent events older than `OUTSIDE_ANALYTICS_RETENTION_DAYS` are deleted daily. The default is 730 days; changes require an updated privacy/retention decision.
- `analytics-backup` creates a separately named encrypted dump using the same escrowed age identity and backup expiry policy. Alerts cover missing/failed backups and retention jobs.

After deployment, verify the tracker returns HTTP 200, the `analytics` container is healthy, `analytics-bootstrap` exited with code 0, the analytics dashboard is unreachable from the public internet, and a test visit appears without query-string or token-route data.
