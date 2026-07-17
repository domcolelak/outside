export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateProductionEnvironment } = await import("@/lib/config/production");
  validateProductionEnvironment();
  const { registerOpenTelemetryMetrics } = await import("@/lib/observability/otel");
  registerOpenTelemetryMetrics();
}
