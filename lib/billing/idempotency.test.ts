import { describe, expect, it } from "vitest";
import { markProcessedOnce } from "./idempotency";

describe("webhook idempotency (in-memory fallback)", () => {
  it("returns true once per event id, false thereafter", async () => {
    const id = `evt_${Math.random()}`;
    expect(await markProcessedOnce(id)).toBe(true);
    expect(await markProcessedOnce(id)).toBe(false);
    expect(await markProcessedOnce(id)).toBe(false);
  });
});
