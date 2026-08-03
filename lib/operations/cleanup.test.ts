import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runOperationalCleanup } from "./cleanup";

const database = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: database.executeRaw,
    $transaction: database.transaction,
  },
}));

beforeEach(() => {
  database.executeRaw.mockReset().mockResolvedValue(1);
  database.transaction.mockReset().mockResolvedValue(Array(9).fill(1));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runOperationalCleanup", () => {
  it("is a safe no-op in memory mode (never touches the database)", async () => {
    vi.stubEnv("OUTSIDE_STORAGE_MODE", "memory");
    const result = await runOperationalCleanup();
    expect(result).toEqual({
      rateLimits: 0, concurrencyLeases: 0, emailOutbox: 0, processedEvents: 0,
      usageEvents: 0, providerUsageEvents: 0, assessmentRuns: 0,
      passwordResets: 0, scanShares: 0,
    });
    expect(database.executeRaw).not.toHaveBeenCalled();
  });

  it("is a safe no-op when no database is configured", async () => {
    vi.stubEnv("OUTSIDE_STORAGE_MODE", "");
    vi.stubEnv("DATABASE_URL", "");
    const result = await runOperationalCleanup();
    expect(result.scanShares).toBe(0);
    expect(result.emailOutbox).toBe(0);
  });

  it("bounds provider telemetry and assessment evidence using indexed creation time", async () => {
    vi.stubEnv("OUTSIDE_STORAGE_MODE", "database");
    vi.stubEnv("DATABASE_URL", "postgresql://outside:test@localhost/outside");
    vi.stubEnv("OUTSIDE_USAGE_RETENTION_DAYS", "180");
    vi.stubEnv("OUTSIDE_ASSESSMENT_RETENTION_DAYS", "365");

    const result = await runOperationalCleanup(new Date("2026-07-29T00:00:00Z"), 500);

    expect(result.providerUsageEvents).toBe(1);
    expect(result.assessmentRuns).toBe(1);
    expect(database.executeRaw).toHaveBeenCalledTimes(9);
    const statements = database.executeRaw.mock.calls
      .map(([parts]) => Array.from(parts as TemplateStringsArray).join("?"))
      .join("\n");
    expect(statements).toContain("provider_usage_events");
    expect(statements).toContain("assessment_runs");
  });
});
