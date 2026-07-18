import { describe, expect, it, vi } from "vitest";
import { isRetryablePostgresTransactionError, retryPostgresTransaction } from "./transaction-retry";

describe("PostgreSQL transaction retries", () => {
  it("recognizes only serialization and deadlock failures", () => {
    expect(isRetryablePostgresTransactionError({ code: "P2034" })).toBe(true);
    expect(isRetryablePostgresTransactionError({ code: "P2010", meta: { code: "40001" } })).toBe(true);
    expect(isRetryablePostgresTransactionError({ code: "P2010", meta: { code: "40P01" } })).toBe(true);
    expect(isRetryablePostgresTransactionError({ code: "P2010", meta: { code: "23505" } })).toBe(false);
    expect(isRetryablePostgresTransactionError(new Error("network failure"))).toBe(false);
  });

  it("recognizes driver-adapter error shapes", () => {
    // Raw query wrapped by the client runtime: P2010 + meta.driverAdapterError.
    const wrapped = (originalCode: string) => ({
      code: "P2010",
      meta: { driverAdapterError: { name: "DriverAdapterError", cause: { kind: "postgres", originalCode } } },
    });
    expect(isRetryablePostgresTransactionError(wrapped("40001"))).toBe(true);
    expect(isRetryablePostgresTransactionError(wrapped("40P01"))).toBe(true);
    expect(isRetryablePostgresTransactionError(wrapped("23505"))).toBe(false);

    // Unmapped SQLSTATE rethrown as a bare DriverAdapterError without a Prisma code.
    const bare = (originalCode: string) => ({
      name: "DriverAdapterError",
      cause: { kind: "postgres", originalCode },
    });
    expect(isRetryablePostgresTransactionError(bare("40P01"))).toBe(true);
    expect(isRetryablePostgresTransactionError(bare("57014"))).toBe(false);
  });

  it("restarts a retryable transaction and returns the committed result", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ code: "P2010", meta: { code: "40001" } })
      .mockResolvedValue("committed");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(retryPostgresTransaction(operation, { baseDelayMs: 0, jitterMs: 0, sleep })).resolves.toBe("committed");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry fatal errors and bounds persistent conflicts", async () => {
    const fatal = vi.fn().mockRejectedValue(new Error("invalid input"));
    await expect(retryPostgresTransaction(fatal, { baseDelayMs: 0, jitterMs: 0 })).rejects.toThrow("invalid input");
    expect(fatal).toHaveBeenCalledOnce();

    const conflict = { code: "P2034" };
    const persistent = vi.fn().mockRejectedValue(conflict);
    await expect(retryPostgresTransaction(persistent, { maxAttempts: 3, baseDelayMs: 0, jitterMs: 0 })).rejects.toBe(conflict);
    expect(persistent).toHaveBeenCalledTimes(3);
  });
});
