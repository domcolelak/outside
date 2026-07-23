import { beforeEach, describe, expect, it } from "vitest";
import { recordEvolutionRun, latestEvolutionRun, __resetEvolutionState } from "./state";

beforeEach(() => __resetEvolutionState());

describe("Evolution run state", () => {
  it("treats the first run as a baseline (0 new) and records totals", () => {
    const r = recordEvolutionRun([{ id: "EVP-1" }, { id: "EVP-2" }], "2026-07-01T00:00:00Z");
    expect(r).toMatchObject({ firstRun: true, total: 2, new: 0 });
    expect(latestEvolutionRun()).toEqual({ at: "2026-07-01T00:00:00Z", total: 2 });
  });

  it("counts only genuinely-new proposals on subsequent runs", () => {
    recordEvolutionRun([{ id: "EVP-1" }, { id: "EVP-2" }], "2026-07-01T00:00:00Z");
    const second = recordEvolutionRun([{ id: "EVP-1" }, { id: "EVP-2" }, { id: "EVP-3" }], "2026-08-01T00:00:00Z");
    expect(second).toMatchObject({ firstRun: false, total: 3, new: 1 });
  });

  it("reports 0 new when nothing changed", () => {
    recordEvolutionRun([{ id: "EVP-1" }], "2026-07-01T00:00:00Z");
    expect(recordEvolutionRun([{ id: "EVP-1" }], "2026-08-01T00:00:00Z").new).toBe(0);
  });

  it("does not re-flag a proposal that disappeared and returned", () => {
    recordEvolutionRun([{ id: "EVP-1" }], "2026-07-01T00:00:00Z");
    recordEvolutionRun([], "2026-08-01T00:00:00Z");
    expect(recordEvolutionRun([{ id: "EVP-1" }], "2026-09-01T00:00:00Z").new).toBe(0); // already known
  });

  it("has no last run before the first analysis", () => {
    expect(latestEvolutionRun()).toBeNull();
  });
});
