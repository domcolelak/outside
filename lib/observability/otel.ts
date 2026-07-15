import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const globalTelemetry = globalThis as unknown as { __outsideMeterProvider?: MeterProvider };

function headers(value: string | undefined): Record<string, string> | undefined {
  if (!value?.trim()) return undefined;
  return Object.fromEntries(value.split(",").map((entry) => entry.split("=", 2).map((part) => decodeURIComponent(part.trim()))).filter((entry): entry is [string, string] => entry.length === 2 && !!entry[0] && !!entry[1]));
}

/** Register a process-wide OTLP metric exporter. No endpoint means safe no-op. */
export function registerOpenTelemetryMetrics(): void {
  if (globalTelemetry.__outsideMeterProvider) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim();
  if (!endpoint) return;
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must be an absolute HTTP(S) URL.");
  const interval = Math.max(5_000, Math.min(300_000, Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? 60_000) || 60_000));
  const exporter = new OTLPMetricExporter({ url: url.toString(), headers: headers(process.env.OTEL_EXPORTER_OTLP_HEADERS), timeoutMillis: Math.min(30_000, interval - 1_000) });
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: interval, exportTimeoutMillis: Math.min(30_000, interval - 1_000), cardinalityLimits: { default: 200 } });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME?.trim() || "outside",
      "service.version": process.env.npm_package_version || "0.1.0",
      "deployment.environment.name": process.env.NODE_ENV || "development",
    }),
    readers: [reader],
  });
  metrics.setGlobalMeterProvider(provider);
  globalTelemetry.__outsideMeterProvider = provider;
}
