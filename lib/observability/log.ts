import { trace } from "@opentelemetry/api";

type LogLevel = "info" | "warn" | "error";

function errorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return {};
  return { errorType: error.name, errorMessage: error.message.slice(0, 500) };
}

/** Structured, bounded operational logs without request bodies or secrets. */
export function operationalLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}, error?: unknown): void {
  const span = trace.getActiveSpan()?.spanContext();
  const tracing = span?.traceId ? { traceId: span.traceId, spanId: span.spanId } : {};
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...tracing, ...fields, ...errorFields(error) });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
