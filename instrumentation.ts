export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerOpenTelemetryMetrics } = await import("@/lib/observability/otel");
  registerOpenTelemetryMetrics();
}
