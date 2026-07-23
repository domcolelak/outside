/**
 * Concentration-risk findings from the Digital Twin. A single shared node (a
 * CDN, a nameserver, one IP, a technology) that a large share of the surface
 * depends on is a resilience and blast-radius concern: if it fails or is
 * compromised, everything downstream is affected at once. Derived from the
 * dependency graph the scan already built — no new observation.
 */

import type { Asset, Edge, Finding, Priority } from "@/lib/types";
import { buildTwin, singlePointsOfFailure } from "@/lib/twin/twin";

function fid(nodeId: string): string {
  return `find_${nodeId}_concentration`.replace(/[^a-z0-9_]/gi, "_");
}

export function generateConcentrationFindings(assets: Asset[], edges: Edge[], now: string): Finding[] {
  const twin = buildTwin(assets, edges);
  const out: Finding[] = [];

  for (const spof of singlePointsOfFailure(twin, 3)) {
    const n = spof.dependentCount;
    const priority: Priority = n >= 8 ? "high" : n >= 5 ? "medium" : "low";
    const sample = spof.impacted.slice(0, 5).map((a) => a.label).join(", ");
    out.push({
      id: fid(spof.node.id),
      title: "Concentrated external dependency (single point of failure)",
      priority,
      confidence: 0.85,
      assetId: spof.node.id,
      category: "infrastructure-concentration",
      observation: `${n} asset(s) in the external surface depend on ${spof.node.label} (${spof.node.kind})${sample ? `: ${sample}${n > 5 ? "…" : ""}` : ""}.`,
      inference: "A shared node that a large part of the surface hangs on concentrates blast radius: a failure, outage, or compromise of it impacts every dependent asset simultaneously.",
      concern: "This is a resilience and availability observation about the topology, not a confirmed vulnerability. Its value is prioritizing redundancy and reducing the reach of a single failure or compromise.",
      reasoning: "Deterministic dependency-graph analysis (Digital Twin): the node's transitive dependent set exceeds the concentration threshold.",
      recommendation: "Reduce the blast radius — add redundancy (secondary provider / multi-region), segment critical surfaces off the shared node, and monitor the node's health as a dependency of everything it fronts.",
      evidence: assets.find((a) => a.id === spof.node.id)?.evidence ?? [],
      discoveryMethod: "dns",
      createdAt: now,
    });
  }

  return out;
}
