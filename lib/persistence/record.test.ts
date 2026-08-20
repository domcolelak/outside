import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/types";
import type { ScanStore } from "./model";
import { recordScan, ScanPersistenceError } from "./record";

const result = {
  scanId: "scan-failed-persistence",
  target: "acme.com",
  graph: { assets: [], edges: [] },
} as unknown as ScanResult;

function failingStore(): ScanStore {
  return {
    getOrCreateTarget: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("database unavailable"), { code: "P1001" }),
      ),
  } as unknown as ScanStore;
}

describe("recordScan persistence policy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fails a monitored/authenticated scan instead of returning a false success", async () => {
    await expect(
      recordScan(failingStore(), result, "org-1", true),
    ).rejects.toMatchObject({
      name: "ScanPersistenceError",
      code: "P1001",
    });
    await expect(
      recordScan(failingStore(), result, "org-1", true),
    ).rejects.toBeInstanceOf(ScanPersistenceError);
  });

  it("retains explicit best-effort behavior for non-monitored callers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      recordScan(failingStore(), result, "org-1"),
    ).resolves.toBeNull();
  });
});
