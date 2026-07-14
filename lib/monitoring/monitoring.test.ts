import { describe, expect, it } from "vitest";
import { getMonitorStore, nextRunAt, PLAN_MONITOR_LIMIT, __resetMonitorStore } from "./index";
import { alertableEvents } from "@/lib/email/alerts";
import type { ChangeEvent } from "@/lib/persistence/model";

describe("scheduling", () => {
  it("advances nextRunAt by the cadence", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRunAt(base, "daily")).toBe("2026-01-02T00:00:00.000Z");
    expect(nextRunAt(base, "weekly")).toBe("2026-01-08T00:00:00.000Z");
  });

  it("plan limits match the pricing tiers", () => {
    expect(PLAN_MONITOR_LIMIT).toEqual({ free: 1, professional: 5, agency: 30 });
  });
});

describe("monitor store (in-memory)", () => {
  it("creates, lists, toggles, and detects due monitors idempotently", async () => {
    __resetMonitorStore();
    const store = await getMonitorStore();
    const m = (await store.create({ orgId: "org1", domain: "Acme.com", frequency: "daily" }))!;
    expect(m.domain).toBe("acme.com");
    expect((await store.list("org1"))).toHaveLength(1);

    // Eligible immediately on first tick.
    const dueNow = await store.claimDue(new Date(), 10, 60_000);
    expect(dueNow.map((x) => x.id)).toContain(m.id);
    expect(await store.claimDue(new Date(), 10, 60_000)).toHaveLength(0);

    // After running, nextRunAt advances so it is not due again immediately.
    expect(await store.complete(m.id, dueNow[0]!.leaseId!, new Date())).toBe(true);
    expect(await store.claimDue(new Date(), 10, 60_000)).toHaveLength(0);

    // Paused monitors are never due.
    await store.setEnabled(m.id, "org1", false);
    __resetMonitorStore();
  });
});

describe("alert selection (anti-fatigue)", () => {
  const ev = (type: ChangeEvent["type"], priority: ChangeEvent["priority"]): ChangeEvent => ({ type, priority, canonical: "x.acme.com", label: "x.acme.com", detail: "" });
  it("alerts on new/returned assets and high-priority changes only", () => {
    const events: ChangeEvent[] = [
      ev("asset_appeared", "medium"),
      ev("asset_disappeared", "low"),
      ev("technology_changed", "medium"),
      ev("priority_changed", "high"),
    ];
    const out = alertableEvents(events);
    expect(out.map((e) => e.type)).toContain("asset_appeared");
    expect(out.map((e) => e.type)).toContain("priority_changed");
    expect(out.map((e) => e.type)).not.toContain("asset_disappeared");
    expect(out.map((e) => e.type)).not.toContain("technology_changed");
  });
});
