import { metrics } from "@opentelemetry/api";
import type { ProviderRun } from "@/lib/types";
import type { GuardianDelivery, GuardianQueueMetrics } from "@/lib/guardian/types";
import type { RetentionRunResult } from "@/lib/guardian/retention";
import type { FunnelEvent } from "@/lib/analytics/events";

const meter = metrics.getMeter("outside.operations", "1.0.0");
const providerLatency = meter.createHistogram("outside.provider.duration", { description: "Discovery provider request duration", unit: "s" });
const providerObservations = meter.createCounter("outside.provider.observations", { description: "Public observations returned by discovery providers", unit: "{observation}" });
const providerCacheRequests = meter.createCounter("outside.provider.cache.requests", { description: "Short-lived provider cache requests", unit: "{request}" });
const queueDepth = meter.createGauge("outside.guardian.queue.depth", { description: "Current Guardian delivery queue depth", unit: "{delivery}" });
const queueAge = meter.createGauge("outside.guardian.queue.oldest_age", { description: "Age of the oldest ready Guardian delivery", unit: "s" });
const deliveryAttempts = meter.createCounter("outside.guardian.delivery.attempts", { description: "Guardian delivery attempts", unit: "{attempt}" });
const deliveryDuration = meter.createHistogram("outside.guardian.delivery.duration", { description: "Guardian delivery attempt duration", unit: "s" });
const retentionDeleted = meter.createCounter("outside.guardian.retention.deleted", { description: "Rows deleted by Guardian retention", unit: "{row}" });
const retentionDuration = meter.createHistogram("outside.guardian.retention.duration", { description: "Guardian retention run duration", unit: "s" });
const enterpriseDeliveryDuration = meter.createHistogram("outside.enterprise.integration.duration", { description: "Enterprise integration provider latency", unit: "s" });
const enterpriseQueueAge = meter.createHistogram("outside.enterprise.queue.age", { description: "Age of a claimed enterprise delivery", unit: "s" });
const enterpriseDeliveryAttempts = meter.createCounter("outside.enterprise.delivery.attempts", { description: "Enterprise integration delivery attempts", unit: "{attempt}" });
const funnelEvents = meter.createCounter("outside.product.funnel.events", { description: "PII-free product funnel events", unit: "{event}" });
const scanDuration = meter.createHistogram("outside.scan.duration", { description: "Complete scan stream duration", unit: "s" });
const scanRuns = meter.createCounter("outside.scan.runs", { description: "Completed scan stream outcomes", unit: "{scan}" });
const reportDuration = meter.createHistogram("outside.report.duration", { description: "PDF report render duration", unit: "s" });
const billingWebhookEvents = meter.createCounter("outside.billing.webhook.events", { description: "Verified Stripe webhook processing outcomes", unit: "{event}" });

export function recordProviderMetrics(runs: ProviderRun[]): void {
  for (const run of runs) {
    const attributes = { "provider.name": run.provider, "discovery.method": run.method, "run.status": run.status };
    const duration = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1_000;
    providerLatency.record(duration, attributes);
    providerObservations.add(run.observations, attributes);
  }
}

export function recordProviderCache(provider: string, result: "hit" | "miss"): void {
  providerCacheRequests.add(1, { "provider.name": provider, "cache.result": result });
}

export function recordGuardianQueueMetrics(state: GuardianQueueMetrics): void {
  queueDepth.record(state.pending, { "delivery.status": "pending" });
  queueDepth.record(state.retry, { "delivery.status": "retry" });
  queueDepth.record(state.sending, { "delivery.status": "sending" });
  queueAge.record(state.oldestReadyAgeSeconds, { "queue.name": "guardian_delivery" });
}

export function recordGuardianDelivery(job: Pick<GuardianDelivery, "channelType" | "kind">, status: "sent" | "failed", durationMs: number): void {
  const attributes = { "channel.type": job.channelType, "delivery.kind": job.kind, "delivery.result": status };
  deliveryAttempts.add(1, attributes);
  deliveryDuration.record(Math.max(0, durationMs) / 1_000, attributes);
}

export function recordRetentionMetrics(result: RetentionRunResult): void {
  retentionDuration.record(result.durationMs / 1_000, { "retention.acquired": result.acquired, "retention.saturated": result.saturated });
  for (const [table, count] of Object.entries(result.deleted)) if (count) retentionDeleted.add(count, { "data.type": table });
}

export function recordEnterpriseDelivery(provider: string, category: string, status: "delivered" | "failed", durationMs: number, ageMs: number): void {
  const attributes = { "integration.provider": provider, "integration.category": category, "delivery.result": status };
  enterpriseDeliveryAttempts.add(1, attributes);
  enterpriseDeliveryDuration.record(Math.max(0, durationMs) / 1_000, attributes);
  enterpriseQueueAge.record(Math.max(0, ageMs) / 1_000, { "queue.name": "enterprise_delivery", "integration.provider": provider });
}

export function recordFunnelEvent(event: FunnelEvent, mode: "real" | "demo" | "product"): void {
  funnelEvents.add(1, { "funnel.event": event, "experience.mode": mode });
}

export function recordScanOperation(mode: "real" | "demo", outcome: "success" | "failed" | "cancelled", durationMs: number): void {
  const attributes = { "experience.mode": mode, "scan.outcome": outcome };
  scanRuns.add(1, attributes);
  scanDuration.record(Math.max(0, durationMs) / 1_000, attributes);
}

export function recordReportOperation(outcome: "success" | "failed" | "capacity", durationMs: number): void {
  reportDuration.record(Math.max(0, durationMs) / 1_000, { "report.outcome": outcome });
}

export function recordBillingWebhook(eventType: string, outcome: "processed" | "duplicate" | "failed"): void {
  billingWebhookEvents.add(1, { "billing.event_type": eventType, "billing.outcome": outcome });
}
