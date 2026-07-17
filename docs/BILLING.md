# Billing operations

Stripe is the billing authority. OUTSIDE grants plan access from verified webhook state, never from the checkout return URL.

## Correctness controls

- Webhook signatures are verified over the bounded raw body.
- Provider event IDs are persisted transactionally with the organization update to prevent replay.
- Subscription updates are ordered by Stripe event creation time and deterministic event precedence. A late, older event cannot overwrite newer state; terminal deletion wins at an equal timestamp.
- Checkout customer creation uses a stable idempotency key.
- Missing or temporarily unavailable Stripe does not erase the last verified durable entitlement.
- Agency customer allocation is application metadata and does not replace Stripe subscription reconciliation.

## Reconciliation

For suspected drift:

1. Stop manual entitlement edits and capture the organization, Stripe customer/subscription IDs, latest stored event ID/time, and audit context.
2. Fetch the current subscription directly from the Stripe dashboard/API using an authorized operator account.
3. Correct webhook endpoint, signing secret, or handler failure first.
4. Replay missing events from Stripe in chronological order. Duplicate events are safe; observe verified webhook outcome metrics.
5. Compare the resulting plan, subscription status, customer ID, event time/rank, and expected feature access.
6. Record the incident and customer-impact window. Use a reviewed database correction only when provider replay cannot represent the authoritative state.

Do not copy card data into tickets, logs, reports, or OUTSIDE fields. Alert on signature failures, repeated processing failures, webhook silence for active billing, and reconciliation mismatches.

