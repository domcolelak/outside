export const FUNNEL_EVENTS = [
  "scan_started", "scan_completed", "scan_failed", "demo_started", "demo_completed",
  "verification_started", "domain_verified", "guardian_viewed", "checkout_started",
  "invite_created", "report_shared", "report_viewed", "agency_created",
] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === "string" && (FUNNEL_EVENTS as readonly string[]).includes(value);
}
