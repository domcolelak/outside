import { describe, expect, it } from "vitest";
import { staleGraphIds } from "./reconcile";

describe("graph reconciliation", () => {
  it("removes nodes absent after a scan restart or target change", () => {
    expect(staleGraphIds(["old-root", "shared", "old-api"], ["new-root", "shared"])).toEqual(["old-root", "old-api"]);
  });
});
