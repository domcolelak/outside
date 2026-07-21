import { describe, expect, it } from "vitest";
import { FUNNEL_EVENTS, isFunnelEvent } from "./events";

describe("isFunnelEvent", () => {
  it("accepts every declared funnel event", () => {
    for (const event of FUNNEL_EVENTS) expect(isFunnelEvent(event)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    for (const bad of ["", "scan", "SCAN_STARTED", "drop table", 1, null, undefined, {}, ["scan_started"]]) {
      expect(isFunnelEvent(bad)).toBe(false);
    }
  });
});
