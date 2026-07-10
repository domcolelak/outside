import { describe, expect, it } from "vitest";
import { isTransientHttp, retryTransient, Semaphore } from "./resilience";

describe("retryTransient", () => {
  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const result = await retryTransient(
      async () => {
        calls += 1;
        if (calls < 3) {
          const e = new Error("429") as Error & { status?: number };
          e.status = 429;
          throw e;
        }
        return "ok";
      },
      isTransientHttp,
      { maxAttempts: 5, baseDelay: 1, maxDelay: 4 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does NOT retry fatal (auth/validation) errors", async () => {
    let calls = 0;
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          const e = new Error("401") as Error & { status?: number };
          e.status = 401;
          throw e;
        },
        isTransientHttp,
        { maxAttempts: 5, baseDelay: 1 },
      ),
    ).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
});

describe("isTransientHttp", () => {
  it("classifies 429 and 5xx as transient, 4xx (non-429) as fatal", () => {
    expect(isTransientHttp({ status: 429 })).toBe(true);
    expect(isTransientHttp({ status: 503 })).toBe(true);
    expect(isTransientHttp({ status: 400 })).toBe(false);
    expect(isTransientHttp({ status: 401 })).toBe(false);
    expect(isTransientHttp(new Error("network"))).toBe(true); // no status
  });
});

describe("Semaphore", () => {
  it("bounds concurrency to max", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      sem.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
