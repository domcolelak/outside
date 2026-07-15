import { metrics } from "@opentelemetry/api";
import type { ProviderRun } from "@/lib/types";
import type { GuardianDelivery, GuardianQueueMetrics } from "@/lib/guardian/types";
import type { RetentionRunResult } from "@/lib/guardian/retention";

const meter = metrics.getMeter("outside.operations", "1.0.0");
const providerLatency = meter.createHistogram("outside.provider.duration", { description: "Discovery provider request duration", unit: "s" });
const providerObservations = meter.createCounter("outside.provider.observations", { description: "Public observations returned by discovery providers", unit: "{observation}" });
const queueDepth = meter.createGauge("outside.guardian.queue.depth", { description: "Current Guardian delivery queue depth", unit: "{delivery}" });
const queueAge = meter.createGauge("outside.guardian.queue.oldest_age", { description: "Age of the oldest ready Guardian delivery", unit: "s" });
const deliveryAttempts = meter.createCounter("outside.guardian.delivery.attempts", { description: "Guardian delivery attempts", unit: "{attempt}" });
const deliveryDuration = meter.createHistogram("outside.guardian.delivery.duration", { description: "Guardian delivery attempt duration", unit: "s" });
const retentionDeleted = meter.createCounter("outside.guardian.retention.deleted", { description: "Rows deleted by Guardian retention", unit: "{row}" });
const retentionDuration = meter.createHistogram("outside.guardian.retention.duration", { description: "Guardian retention run duration", unit: "s" });

export function recordProviderMetrics(runs: ProviderRun[]): void {
  for (const run of runs) {
    const attributes = { "provider.name": run.provider, "discovery.method": run.method, "run.status": run.status };
    const duration = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1_000;
    providerLatency.record(duration, attributes);
    providerObservations.add(run.observations, attributes);
  }
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
