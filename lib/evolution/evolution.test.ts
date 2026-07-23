import { describe, expect, it } from "vitest";
import { detectCoverageGaps, buildProposals } from "./evolution";
import type { KevIndex, KevRecord } from "@/lib/analysis/kev";

function rec(cveId: string, vendor: string, product: string, over: Partial<KevRecord> = {}): KevRecord {
  return { cveId, vendor, product, name: cveId, dateAdded: "2026-07-01", knownRansomware: false, shortDescription: "", ...over };
}
function kevIndex(records: KevRecord[]): KevIndex {
  const map = new Map(records.map((r) => [r.cveId, r]));
  return { get: (id) => map.get(id.toUpperCase()), all: () => records, size: records.length, syncedAt: "2026-07-23", source: "test" };
}

const NOW = new Date("2026-07-20T00:00:00Z");

describe("Evolution coverage-gap detection", () => {
  it("flags an exploited CVE on a fingerprinted product OUTSIDE cannot yet correlate", () => {
    const kev = kevIndex([
      rec("CVE-2099-0001", "Apache", "HTTP Server", { knownRansomware: true, dateAdded: "2026-07-10" }),
      rec("CVE-2021-41773", "Apache", "HTTP Server"),         // already covered → excluded
      rec("CVE-2099-0002", "Microsoft", "Windows"),           // not fingerprinted → excluded
      rec("CVE-2099-0003", "nginx", "nginx"),                 // gap
    ]);
    const gaps = detectCoverageGaps(kev, NOW);
    const ids = gaps.map((g) => g.cveId);
    expect(ids).toContain("CVE-2099-0001");
    expect(ids).toContain("CVE-2099-0003");
    expect(ids).not.toContain("CVE-2021-41773"); // already correlated
    expect(ids).not.toContain("CVE-2099-0002");  // not a product OUTSIDE fingerprints
  });

  it("ranks ransomware-linked, recent, deadline-bound gaps highest", () => {
    const kev = kevIndex([
      rec("CVE-2099-1000", "Apache", "HTTP Server", { knownRansomware: true, dueDate: "2026-08-01", dateAdded: "2026-07-15" }),
      rec("CVE-2099-2000", "nginx", "nginx", { dateAdded: "2020-01-01" }),
    ]);
    const gaps = detectCoverageGaps(kev, NOW);
    expect(gaps[0]!.cveId).toBe("CVE-2099-1000");
    expect(gaps[0]!.externalSignalScore).toBeGreaterThan(gaps[1]!.externalSignalScore);
  });
});

describe("Evolution proposals", () => {
  it("produces founder-gated DRAFT proposals, never auto-applied", () => {
    const kev = kevIndex([rec("CVE-2099-0001", "Apache", "HTTP Server", { knownRansomware: true, dateAdded: "2026-07-15" })]);
    const proposals = buildProposals(detectCoverageGaps(kev, NOW));
    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.status).toBe("draft");
    expect(p.requiresFounderApproval).toBe(true);
    expect(p.priority).toBe("high");
    expect(p.evidence.source).toBe("CISA KEV");
    expect(p.proposedChange).toContain("KNOWN_VULNERABILITIES");
    expect(p.summary).toContain("ransomware");
  });

  it("is empty when KEV coverage is complete", () => {
    expect(buildProposals(detectCoverageGaps(kevIndex([rec("CVE-2021-41773", "Apache", "HTTP Server")]), NOW))).toEqual([]);
  });
});
