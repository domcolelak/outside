import { describe, expect, it } from "vitest";
import { buildTwin, blastRadius, dependencyChain, singlePointsOfFailure } from "./twin";
import { generateConcentrationFindings } from "@/lib/analysis/concentration";
import type { Asset, Edge, EdgeKind } from "@/lib/types";

function asset(id: string, kind: Asset["kind"] = "web_service"): Asset {
  return { id, kind, label: id, canonical: id, firstObservedAt: "", lastObservedAt: "", discoveredVia: [], evidence: [], signals: [], priority: "info", orgConfidence: 1, attrs: {} };
}
function edge(from: string, to: string, kind: EdgeKind): Edge {
  return { id: `${from}_${to}_${kind}`, from, to, kind, confidence: 1, evidence: [] };
}

// A CDN 'cf' fronts eight assets; two of them also resolve to a shared IP.
const cdn = asset("cf", "cdn");
const ip = asset("ip1", "ip");
const webs = Array.from({ length: 8 }, (_, i) => asset(`web${i}`));
const assets = [cdn, ip, ...webs];
const edges: Edge[] = [
  ...webs.map((w) => edge(w.id, "cf", "fronted_by")),
  edge("web0", "ip1", "resolves_to"),
  edge("web1", "ip1", "resolves_to"),
  edge("cf", "web0", "subdomain_of"), // structural, must NOT create a dependency
];

const twin = buildTwin(assets, edges);

describe("Digital Twin dependency model", () => {
  it("builds dependency edges only for failure-propagating relationships", () => {
    // web0 depends on cf and ip1 (fronted_by, resolves_to) — not via the structural edge.
    expect(dependencyChain(twin, "web0").map((n) => n.id).sort()).toEqual(["cf", "ip1"]);
  });

  it("computes blast radius as everything transitively dependent on a node", () => {
    expect(blastRadius(twin, "cf").length).toBe(8); // all eight web assets
    expect(blastRadius(twin, "ip1").map((n) => n.id).sort()).toEqual(["web0", "web1"]);
    expect(blastRadius(twin, "web0")).toEqual([]); // a leaf has no dependents
  });

  it("identifies single points of failure worst-first, above the threshold", () => {
    const spofs = singlePointsOfFailure(twin, 3);
    expect(spofs[0]!.node.id).toBe("cf");
    expect(spofs[0]!.dependentCount).toBe(8);
    expect(spofs.map((s) => s.node.id)).not.toContain("ip1"); // 2 < threshold 3
  });

  it("does not loop or double-count on cycles", () => {
    const cyc = buildTwin([asset("a"), asset("b")], [edge("a", "b", "depends_on"), edge("b", "a", "depends_on")]);
    expect(blastRadius(cyc, "a").map((n) => n.id)).toEqual(["b"]);
  });
});

describe("concentration findings from the twin", () => {
  it("flags a heavily-shared node as a single point of failure", () => {
    const findings = generateConcentrationFindings(assets, edges, "now");
    const f = findings.find((x) => x.category === "infrastructure-concentration");
    expect(f).toBeTruthy();
    expect(f!.priority).toBe("high"); // 8 dependents
    expect(f!.observation).toContain("8 asset(s)");
    expect(f!.assetId).toBe("cf");
  });

  it("produces nothing below the concentration threshold", () => {
    const small = [asset("x"), asset("y"), asset("cdn2", "cdn")];
    const e = [edge("x", "cdn2", "fronted_by"), edge("y", "cdn2", "fronted_by")]; // only 2
    expect(generateConcentrationFindings(small, e, "now")).toEqual([]);
  });
});
