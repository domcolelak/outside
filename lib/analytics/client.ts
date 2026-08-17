import type { FunnelEvent } from "./events";

type AnalyticsValue = string | number | boolean;
type AnalyticsData = Record<string, AnalyticsValue>;
type UmamiTracker = { track: (event: string, data?: AnalyticsData) => void };
type ProductEvent = FunnelEvent | "campaign_visit";

const CAMPAIGN_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
const SAFE_CAMPAIGN_CODE = /^[a-z0-9][a-z0-9._~-]{0,79}$/i;

function minimizedData(event: ProductEvent, data?: AnalyticsData): AnalyticsData | undefined {
  if (!data) return undefined;
  if (event === "campaign_visit") {
    const safe = Object.fromEntries(Object.entries(data).filter(([key, value]) => CAMPAIGN_KEYS.has(key) && typeof value === "string" && SAFE_CAMPAIGN_CODE.test(value)));
    return Object.keys(safe).length ? safe : undefined;
  }
  if (event === "checkout_started" && (data.plan === "professional" || data.plan === "agency")) return { plan: data.plan };
  if (data.mode === "real" || data.mode === "demo" || data.mode === "product") return { mode: data.mode };
  return undefined;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
    __outsideAnalyticsConfigured?: boolean;
    __outsideAnalyticsQueue?: Array<{ event: string; data?: AnalyticsData }>;
    __outsideAnalyticsFlush?: number;
  }
}

function flushAnalyticsQueue(): void {
  if (typeof window === "undefined" || !window.umami) return;
  const queued = window.__outsideAnalyticsQueue?.splice(0) ?? [];
  for (const item of queued) window.umami.track(item.event, item.data);
  if (window.__outsideAnalyticsFlush) {
    window.clearInterval(window.__outsideAnalyticsFlush);
    window.__outsideAnalyticsFlush = undefined;
  }
}

/** Best-effort, anonymous browser analytics. Never pass tenant or customer data. */
export function trackProductEvent(event: ProductEvent, data?: AnalyticsData): void {
  if (typeof window === "undefined" || !window.__outsideAnalyticsConfigured) return;
  try {
    const minimized = minimizedData(event, data);
    if (window.umami) {
      window.umami.track(event, minimized);
      return;
    }
    const queue = (window.__outsideAnalyticsQueue ??= []);
    if (queue.length < 50) queue.push({ event, data: minimized });
    if (!window.__outsideAnalyticsFlush) {
      let attempts = 0;
      window.__outsideAnalyticsFlush = window.setInterval(() => {
        attempts += 1;
        flushAnalyticsQueue();
        if (attempts >= 20 && window.__outsideAnalyticsFlush) {
          window.clearInterval(window.__outsideAnalyticsFlush);
          window.__outsideAnalyticsFlush = undefined;
          window.__outsideAnalyticsQueue = [];
        }
      }, 250);
    }
  } catch {
    // Analytics must never affect a product flow.
  }
}

/** First-party, PII-free product event. Delivery is intentionally best effort. */
export function trackFunnel(event: FunnelEvent, mode: "real" | "demo" | "product" = "product"): void {
  trackProductEvent(event, { mode });
  const body = JSON.stringify({ event, mode });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}
