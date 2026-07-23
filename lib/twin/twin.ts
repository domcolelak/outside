/**
 * Digital Twin — a relationship and dependency model of the customer's external
 * world, derived deterministically from the asset graph the scan already builds.
 *
 * It adds no data: it re-reads the existing assets + edges as a directed
 * dependency graph (A → B means "A depends on B, and is impacted if B fails or
 * is compromised"). From that it answers the questions a flat inventory can't:
 * what does this asset rely on, what is the blast radius if a shared node is
 * lost, and which single nodes carry a disproportionate share of the surface.
 */

import type { Asset, Edge, EdgeKind, Priority } from "@/lib/types";

/** Edge kinds where `from` depends on `to` (failure of `to` impacts `from`). */
const DEPENDENCY_EDGES: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "resolves_to", "fronted_by", "delegated_to", "certified_by", "runs", "depends_on", "mail_for",
]);

export interface TwinNode {
  id: string;
  label: string;
  kind: string;
  priority: Priority;
}

export interface DigitalTwin {
  nodes: Map<string, TwinNode>;
  /** id → the ids it directly depends on. */
  dependsOn: Map<string, Set<string>>;
  /** id → the ids that directly depend on it. */
  dependents: Map<string, Set<string>>;
}

export interface SinglePointOfFailure {
  node: TwinNode;
  /** Every asset transitively impacted if this node fails. */
  impacted: TwinNode[];
  dependentCount: number;
}

export function buildTwin(assets: Asset[], edges: Edge[]): DigitalTwin {
  const nodes = new Map<string, TwinNode>();
  for (const a of assets) nodes.set(a.id, { id: a.id, label: a.label, kind: a.kind, priority: a.priority });
  const dependsOn = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const link = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);

  for (const e of edges) {
    if (!DEPENDENCY_EDGES.has(e.kind)) continue;
    if (!nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) continue;
    link(dependsOn, e.from, e.to);
    link(dependents, e.to, e.from);
  }
  return { nodes, dependsOn, dependents };
}

/** Transitive closure over an adjacency map, excluding the start node. */
function reachable(adj: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || id === start) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) if (!seen.has(next)) stack.push(next);
  }
  return seen;
}

/** Everything transitively impacted if `nodeId` is lost or compromised. */
export function blastRadius(twin: DigitalTwin, nodeId: string): TwinNode[] {
  return [...reachable(twin.dependents, nodeId)]
    .map((id) => twin.nodes.get(id))
    .filter((n): n is TwinNode => !!n);
}

/** Everything `assetId` transitively depends on (its supply chain). */
export function dependencyChain(twin: DigitalTwin, assetId: string): TwinNode[] {
  return [...reachable(twin.dependsOn, assetId)]
    .map((id) => twin.nodes.get(id))
    .filter((n): n is TwinNode => !!n);
}

/** Shared nodes a disproportionate share of the surface hangs on. Sorted worst-first. */
export function singlePointsOfFailure(twin: DigitalTwin, minDependents = 3): SinglePointOfFailure[] {
  const out: SinglePointOfFailure[] = [];
  for (const [id, node] of twin.nodes) {
    const impacted = blastRadius(twin, id);
    if (impacted.length >= minDependents) out.push({ node, impacted, dependentCount: impacted.length });
  }
  return out.sort((a, b) => b.dependentCount - a.dependentCount);
}
