import { describe, expect, it } from "vitest";
import { validateRetentionValues } from "./retention";

describe("Guardian retention policy", () => {
  const valid = { scanDays: 730, snapshotDays: 365, eventDays: 365, deliveryDays: 90, activityDays: 180, digestDays: 730 };
  it("accepts a bounded policy", () => expect(validateRetentionValues(valid)).toEqual(valid));
  it("rejects out-of-range and structurally unsafe policies", () => {
    expect(() => validateRetentionValues({ ...valid, deliveryDays: 2 })).toThrow(/deliveryDays/);
    expect(() => validateRetentionValues({ ...valid, scanDays: 30, snapshotDays: 365 })).toThrow(/scanDays/);
    expect(() => validateRetentionValues({ ...valid, eventDays: 45.5 })).toThrow(/eventDays/);
  });
});
