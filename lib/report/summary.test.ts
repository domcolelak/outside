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
    expect(one).toContain("1 observable asset,");
    expect(one).toContain("1 public web/API surface.");
    expect(one).toContain("a well-contained surface, scoring 12/100");

    const many = buildExecutiveSummary(result({ assets: 25, webSurfaces: 3 }, { band: "exposed", value: 88 }));
    expect(many).toContain("25 observable assets");
    expect(many).toContain("3 public web/API surfaces");
    expect(many).toContain("a broad and exposed surface, scoring 88/100");
  });

  it("scales the complexity phrase with the asset count", () => {
    expect(buildExecutiveSummary(result({ assets: 3 }))).toContain("a small public digital footprint");
    expect(buildExecutiveSummary(result({ assets: 30 }))).toContain("a sizeable public digital footprint");
    expect(buildExecutiveSummary(result({ assets: 100 }))).toContain("a large public digital footprint");
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
