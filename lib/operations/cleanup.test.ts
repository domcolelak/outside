import { afterEach, describe, expect, it, vi } from "vitest";
import { runOperationalCleanup } from "./cleanup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runOperationalCleanup", () => {
  it("is a safe no-op in memory mode (never touches the database)", async () => {
    vi.stubEnv("OUTSIDE_STORAGE_MODE", "memory");
    const result = await runOperationalCleanup();
    expect(result).toEqual({
      rateLimits: 0, concurrencyLeases: 0, emailOutbox: 0, processedEvents: 0,
      usageEvents: 0, passwordResets: 0, scanShares: 0,
    });
  });

  it("is a safe no-op when no database is configured", async () => {
    vi.stubEnv("OUTSIDE_STORAGE_MODE", "");
    vi.stubEnv("DATABASE_URL", "");
    const result = await runOperationalCleanup();
    expect(result.scanShares).toBe(0);
    expect(result.emailOutbox).toBe(0);
  });
});
