import { describe, expect, it } from "vitest";
import { BoundedTtlCache } from "./cache";

describe("bounded provider cache", () => {
  it("expires observations and returns defensive copies", () => {
    const cache = new BoundedTtlCache<{ records: string[] }>(2, 100);
    cache.set("dns:a", { records: ["192.0.2.1"] }, 1000);
    const hit = cache.get("dns:a", 1050)!;
    hit.records.push("changed");
    expect(cache.get("dns:a", 1050)).toEqual({ records: ["192.0.2.1"] });
    expect(cache.get("dns:a", 1100)).toBeUndefined();
  });

  it("evicts the least recently used entry at its bound", () => {
    const cache = new BoundedTtlCache<number>(2, 1000);
    cache.set("a", 1, 0); cache.set("b", 2, 0); cache.get("a", 1); cache.set("c", 3, 1);
    expect(cache.get("b", 1)).toBeUndefined();
    expect(cache.get("a", 1)).toBe(1);
  });
});
