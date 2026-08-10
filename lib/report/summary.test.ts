import { describe, expect, it } from "vitest";
import { buildExecutiveSummary } from "./summary";
import type { ScanResult, ScanStats } from "@/lib/types";

function result(stats: Partial<ScanStats>, opts: { band?: string; value?: number; target?: string; changeSummary?: ScanResult["changeSummary"] } = {}): ScanResult {
  return {
    target: opts.target ?? "acme.com",
    score: { band: opts.band ?? "moderate", value: opts.value ?? 42 },
    stats: { assets: 0, webSurfaces: 0, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0, ...stats },
    changeSummary: opts.changeSummary,
  } as unknown as ScanResult;
}

describe("buildExecutiveSummary", () => {
  it("states the footprint size, surfaces, band and score with correct singular/plural", () => {
    const one = buildExecutiveSummary(result({ assets: 1, webSurfaces: 1 }, { band: "guarded", value: 12 }));
    expect(one).toContain("1 observable asset");
    expect(one).toContain("1 public web or API surface");
    expect(one).toContain("well contained");
    expect(one).toContain("12/100");

    const many = buildExecutiveSummary(result({ assets: 25, webSurfaces: 3 }, { band: "exposed", value: 88 }));
    expect(many).toContain("25 observable assets");
    expect(many).toContain("3 public web or API surfaces");
    expect(many).toContain("broad and exposed");
    expect(many).toContain("88/100");
  });

  it("scales the complexity sentence with the asset count", () => {
    // Its own sentence rather than an adjective slotted into a carrying one:
    // Slavic adjectives agree with case and number, so a fragment that reads
    // correctly in one sentence is wrong in the next.
    expect(buildExecutiveSummary(result({ assets: 3 }))).toContain("a small surface");
    expect(buildExecutiveSummary(result({ assets: 30 }))).toContain("a sizeable surface");
    expect(buildExecutiveSummary(result({ assets: 100 }))).toContain("a large surface");
  });

  it("adds shadow-asset and non-production sentences only when present", () => {
    const summary = buildExecutiveSummary(result({ assets: 10, shadowAssets: 2, nonProdSignals: 1 }));
    expect(summary).toContain("2 assets show signals");
    expect(summary).toContain("1 publicly reachable hostname carries");
    const clean = buildExecutiveSummary(result({ assets: 10 }));
    expect(clean).not.toContain("show signals");
    expect(clean).not.toContain("non-production naming indicators");
  });

  it("reports an all-clear only when nothing noteworthy was observed", () => {
    expect(buildExecutiveSummary(result({ assets: 5 }))).toContain("No shadow assets, non-production exposure, or high-priority findings");
    expect(buildExecutiveSummary(result({ assets: 5, highPriorityFindings: 1 }))).not.toContain("No shadow assets");
  });

  it("surfaces the most significant recent change", () => {
    const changed = buildExecutiveSummary(result({ assets: 6 }, {
      changeSummary: { events: [{ type: "asset_appeared", label: "vpn.acme.com" }] } as ScanResult["changeSummary"],
    }));
    expect(changed).toContain("vpn.acme.com");
    expect(changed).toContain("newly observed");
  });
});
