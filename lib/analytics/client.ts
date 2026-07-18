import type { FunnelEvent } from "./events";

/** First-party, PII-free product event. Delivery is intentionally best effort. */
export function trackFunnel(event: FunnelEvent, mode: "real" | "demo" | "product" = "product"): void {
  const body = JSON.stringify({ event, mode });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}
