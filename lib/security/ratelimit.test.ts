import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimits, rateLimit, requireBudgets } from "./ratelimit";

describe("rate-limit budgets", () => {
  beforeEach(() => {
    process.env.OUTSIDE_STORAGE_MODE = "memory";
    __resetRateLimits();
  });

  it("rolls back earlier buckets when a later budget rejects the request", async () => {
    expect((await rateLimit("client:blocked", 1, 60_000)).ok).toBe(true);

    const rejected = await requireBudgets([
      { key: "global", limit: 2, windowMs: 60_000 },
      { key: "client:blocked", limit: 1, windowMs: 60_000 },
    ]);
    expect(rejected.ok).toBe(false);

    expect((await requireBudgets([
      { key: "global", limit: 2, windowMs: 60_000 },
      { key: "client:healthy", limit: 10, windowMs: 60_000 },
    ])).ok).toBe(true);
    expect((await requireBudgets([
      { key: "global", limit: 2, windowMs: 60_000 },
      { key: "client:healthy", limit: 10, windowMs: 60_000 },
    ])).ok).toBe(true);
    expect((await rateLimit("global", 2, 60_000)).ok).toBe(false);
  });

  it("rejects a non-positive limit without consuming a bucket", async () => {
    expect((await rateLimit("disabled", 0, 60_000)).ok).toBe(false);
    expect((await rateLimit("disabled", 1, 60_000)).ok).toBe(true);
  });
});
