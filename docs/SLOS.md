# Initial pilot service objectives

These are provisional engineering objectives, not contractual guarantees. Latency and recovery thresholds must be replaced with values measured in the chosen staging infrastructure and then reviewed after at least 30 days of representative pilot traffic.

| Service indicator | Provisional objective | Measurement source | Window | Alert threshold | Owner and response |
|---|---:|---|---|---|---|
| Application availability | 99.5% successful external readiness probes | Prometheus blackbox `probe_success` | rolling 30 days | 2 minutes unavailable | Platform: check edge/app/DB, stop rollout, recover or roll back |
| Interactive API latency | 95% of non-scan requests under 750 ms | Caddy request-duration histogram, excluding streaming scan/report routes | rolling 1 hour | p95 above 2 s for 10 minutes | Platform: identify route/dependency, inspect DB and resource saturation |
| Scan completion | 95% of accepted scans finish within 3 minutes | `outside.scan.duration` and outcome counters | rolling 24 hours | failure ratio above 10% or p95 above 3 minutes | Discovery: isolate provider and preserve degraded evidence |
| Guardian scheduled run | 95% of due monitors complete within 15 minutes of due time | scheduler last-success, monitor lease/queue metrics | rolling 24 hours | oldest ready work above 15 minutes | Platform: scheduler/lease/provider runbook |
| Notification delivery | 95% of accepted deliveries complete within 5 minutes, excluding destination rejection | Guardian/Enterprise delivery metrics | rolling 24 hours | repeated failures or queue age above 15 minutes | Integrations: validate destination, retry bounds, credential status |
| Queue delay | p95 ready-job age under 5 minutes | Guardian queue oldest age and Enterprise queue age | rolling 1 hour | oldest job above 15 minutes | Platform: inspect scheduler, leases and upstream latency |
| Report generation | 95% complete within 30 seconds | `outside.report.duration` | rolling 24 hours | p95 above 60 seconds | Product platform: inspect renderer concurrency/memory |
| Recovery time | Service ready within 30 minutes for a single-instance/app failure | incident timestamps and blackbox probe | per incident | 15 minutes elapsed without stable recovery | Incident commander: escalate, choose rollback/restore |
| Backup success | At least one successful encrypted backup every 24 hours | `outside_backup_last_success_unixtime` plus provider backup control | daily | no success in 26 hours | Database owner: run manual backup and assess RPO |
| Restore capability | Full isolated restore and application validation at least quarterly | signed restore-drill record | quarterly | drill overdue or failed | Database + platform: block high-risk release until remediated |

## Measurement rules

- Exclude planned maintenance only when it was announced, time-bounded, and recorded.
- Do not remove provider failures or missing evidence from scan metrics. Segment them by deterministic provider/outcome labels.
- Do not label demo traffic as customer traffic.
- Do not infer contractual RPO/RTO from the repository drill. The achieved data-loss window depends on the managed database backup and replication configuration.
- Alert thresholds are intentionally looser than objectives to avoid paging on short noise. Every page has an action in `docs/RUNBOOKS.md`.

## Pilot review

Review weekly during the controlled pilot: traffic volume, error budget, queue age, provider availability, false-positive feedback, resource headroom, support load, backup evidence, and all objective breaches. Assign a named owner before launch; a role name in this file is not an on-call assignment.
