# Performance and capacity

OUTSIDE uses bounded work rather than claiming an unmeasured fleet limit. Capacity must be established on the production database, network, scheduler, and provider mix.

## Implemented controls

- Graph repulsion switches to Barnes-Hut approximation and canvas rendering uses viewport culling, spatial hit testing, density-aware detail, idle suspension, and reconciliation instead of rebuilding all nodes.
- Scan streams maintain constant-time asset and edge identity maps, cap client logs, bound active HTTPS observations, provider bodies, provider timeouts, and concurrent work.
- Provider DNS results use a bounded TTL cache with hit/miss metrics. Results are never used to bypass request-time public-address validation.
- Portfolio and Enterprise queries are cursor- and limit-bounded. Fleet cron returns a continuation cursor.
- Database-backed jobs use leases, idempotency keys, bounded batches, retry state, and indexes for ready/oldest work.
- Report generation has a global concurrency lease and endpoint-specific rate budgets.
- OpenTelemetry records provider duration/outcomes, scan and Guardian duration, queue depth/age, integration delivery latency, report duration, retention throughput, and verified billing-webhook outcomes without high-cardinality tenant labels.

## Regression budget

The deterministic 1,000-node Barnes-Hut unit benchmark must complete a simulation step in less than 750 ms on a shared CI runner. This generous ceiling catches accidental quadratic regressions; it is not a browser frame-time or customer-facing SLA. Correctness tests compare approximation direction with direct all-pairs force.

No repository-only test proves end-to-end latency under real DNS, CT, PostgreSQL, egress, or browser conditions. Before broad launch, run the following production-like tests and retain raw results:

| Workload | Required observation |
| --- | --- |
| 10, 100, and 1,000+ graph assets | interaction latency, render CPU, heap, long tasks, reduced-motion behavior |
| small and large verified scans | stream time-to-first-event, total duration, provider error ratio, peak memory |
| dozens/hundreds of agency clients | portfolio p50/p95, query count, DB CPU, continuation completion |
| concurrent Guardian runs | queue age/depth, lease recovery, provider concurrency, false-change suppression |
| notification burst | delivery throughput, duplicates, retry age, provider throttling |
| concurrent PDF reports | latency, memory, capacity rejection and recovery |

## Initial launch budgets

Treat these as alerting targets to validate, not achieved measurements:

- authenticated API p95 below 500 ms excluding scans and report rendering;
- provider p95 below its configured deadline and error ratio below 5% over 15 minutes;
- oldest ready Guardian/delivery job below two scheduler intervals;
- report generation below 30 seconds with bounded 503 capacity rejection;
- database pool below 80% sustained utilization and no lock waits above 5 seconds;
- readiness failure or missed cron invocation pages the operator.

Revise budgets only from captured production or staging evidence. A single tenant must not receive higher concurrency until shared-resource saturation and denial-of-wallet impact are understood.

