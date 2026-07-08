/**
 * Scan engine. Produces a ScanResult from either a demo org or a real passive
 * scan, and streams staged events for the cinematic scan UI. Classification,
 * scoring, and finding generation are shared across both paths so demo output
 * is structurally identical to real output (only the source data differs).
 */

import { generateFindings } from "@/lib/analysis/findings";
import { computeExposureScore } from "@/lib/analysis/scoring";
import { assetPriority, detectAssetSignals, type SignalContext } from "@/lib/analysis/signals";
import type { DemoOrg } from "@/lib/demo";
import { registrableDomain } from "@/lib/security/target";
import type {
  Asset,
  AssetKind,
  AttackerBeat,
  Edge,
  ScanEvent,
  ScanResult,
  ScanStats,
} from "@/lib/types";
import { mapPool } from "./net";
import { certificateTransparency, resolveHost, resolveMailAndNs } from "./providers";
import { asset, edge, ev, resetSeq } from "@/lib/demo/factory";

export type Emit = (event: ScanEvent) => void | Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STAGE_LABELS: Record<string, string> = {
  init: "Initializing external view",
  dns: "Inspecting public DNS relationships",
  certificates: "Reviewing certificate evidence",
  correlate: "Correlating observed hostnames",
  http: "Checking public web reachability",
  normalize: "Normalizing discovered assets",
  graph: "Building organization graph",
  classify: "Classifying exposure signals",
  score: "Calculating exposure score",
  done: "Preparing external view",
};

async function stage(emit: Emit, s: keyof typeof STAGE_LABELS, work: () => Promise<void>) {
  await emit({ type: "stage", stage: s as never, label: STAGE_LABELS[s]!, status: "start" });
  await work();
  await emit({ type: "stage", stage: s as never, label: STAGE_LABELS[s]!, status: "done" });
}

/**
 * Classification pass shared by demo + passive: derive per-asset signals and
 * priorities, then finalize into a ScanResult.
 */
function finalize(
  target: string,
  mode: "passive" | "demo",
  assets: Asset[],
  edges: Edge[],
  timeline: AttackerBeat[],
  linkedFromPrimary: string[],
  scanId: string,
  startedAt: string,
): ScanResult {
  const now = new Date().toISOString();
  const degreeById = new Map<string, number>();
  for (const e of edges) {
    degreeById.set(e.from, (degreeById.get(e.from) ?? 0) + 1);
    degreeById.set(e.to, (degreeById.get(e.to) ?? 0) + 1);
  }
  const ctx: SignalContext = { linkedFromPrimary: new Set(linkedFromPrimary), degreeById, now };

  for (const a of assets) {
    a.signals = detectAssetSignals(a, edges, ctx);
    a.priority = assetPriority(a.signals);
  }

  const findings = generateFindings(assets, edges, now);
  const score = computeExposureScore(assets, findings);

  const stats: ScanStats = {
    assets: assets.length,
    webSurfaces: assets.filter((a) => a.kind === "web_service" || a.kind === "api_surface").length,
    shadowAssets: assets.filter((a) => a.signals.some((s) => s.code === "asset.shadow")).length,
    highPriorityFindings: findings.filter((f) => f.priority === "high" || f.priority === "critical").length,
    nonProdSignals: assets.filter((a) => a.signals.some((s) => s.code === "env.nonprod")).length,
  };

  return {
    scanId,
    target,
    mode,
    isDemo: mode === "demo",
    startedAt,
    finishedAt: now,
    graph: { assets, edges },
    findings,
    score,
    timeline,
    providerRuns: [],
    stats,
  };
}

/** Demo scan: replay the storyline with staged pacing for the cinematic effect. */
export async function runDemoScan(org: DemoOrg, scanId: string, emit: Emit): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  await stage(emit, "init", async () => {
    await emit({ type: "log", level: "info", message: `Target locked: ${org.domain} (demo dataset)` });
    await sleep(280);
  });

  // Reveal assets progressively following the storyline beats.
  const revealed = new Set<string>();
  await stage(emit, "certificates", async () => {
    await emit({ type: "log", level: "info", message: "Reviewing public certificate transparency evidence" });
    await sleep(220);
  });

  for (const beat of org.timeline) {
    for (const id of beat.revealAssetIds) {
      const a = org.assets.find((x) => x.id === id);
      if (!a || revealed.has(id)) continue;
      revealed.add(id);
      await emit({ type: "asset", asset: a });
      const level = beat.emphasis === "shadow" ? "signal" : beat.emphasis === "signal" ? "signal" : "add";
      await emit({ type: "log", level, message: `${a.label} discovered` });
      await sleep(160);
    }
    for (const id of beat.revealEdgeIds) {
      const e = org.edges.find((x) => x.id === id);
      if (e) await emit({ type: "edge", edge: e });
    }
    await sleep(120);
  }

  // Any assets/edges not covered by beats (safety) get revealed now.
  for (const a of org.assets) {
    if (!revealed.has(a.id)) {
      await emit({ type: "asset", asset: a });
      revealed.add(a.id);
    }
  }
  for (const e of org.edges) await emit({ type: "edge", edge: e });

  const result = finalize(org.domain, "demo", org.assets, org.edges, org.timeline, org.linkedFromPrimary, scanId, startedAt);
  await stage(emit, "classify", async () => {
    await emit({ type: "log", level: "signal", message: `${result.stats.shadowAssets} possible shadow asset signal(s) correlated` });
    await sleep(200);
  });
  await stage(emit, "score", async () => {
    await emit({ type: "log", level: "info", message: `Exposure score: ${result.score.value}/100` });
    await sleep(160);
  });
  if (org.changeSummary) result.changeSummary = org.changeSummary;
  // The terminal `result` event is emitted by the caller after optional
  // persistence + change detection, so the client receives history in one shot.
  return result;
}

function classifyKind(host: string, resolves: boolean): AssetKind {
  if (/(^|[.-])(api|graphql|rest|grpc)([.-]|$)/.test(host)) return "api_surface";
  if (/(^|[.-])(vpn|sso|login|auth|adfs|okta|owa|remote|citrix|admin|portal|webmail)([.-]|$)/.test(host)) return "auth_surface";
  return resolves ? "web_service" : "subdomain";
}

/** Passive scan against a real domain using public CT + DNS. */
export async function runPassiveScan(domain: string, scanId: string, emit: Emit): Promise<ScanResult> {
  resetSeq();
  const startedAt = new Date().toISOString();
  const reg = registrableDomain(domain);
  const now = new Date().toISOString();

  const root = asset({
    kind: "root_domain",
    label: domain,
    discoveredVia: ["seed"],
    evidence: [ev("seed", "OUTSIDE", "Root domain provided as the scan target.", undefined, now)],
    orgConfidence: 1,
    attrs: {},
  });

  const assets: Asset[] = [root];
  const edges: Edge[] = [];
  const timeline: AttackerBeat[] = [{ t: 1, headline: "Root domain identified", detail: domain, revealAssetIds: [root.id], revealEdgeIds: [] }];
  const linkedFromPrimary: string[] = [`www.${reg}`];

  await stage(emit, "init", async () => {
    await emit({ type: "log", level: "info", message: `Target locked: ${domain}` });
    await emit({ type: "asset", asset: root });
  });

  let ctHosts: string[] = [];
  await stage(emit, "certificates", async () => {
    try {
      const rows = await certificateTransparency(domain);
      ctHosts = rows.map((r) => r.host);
      await emit({ type: "log", level: "info", message: `${ctHosts.length} candidate hostname(s) from certificate transparency` });
    } catch (e) {
      await emit({ type: "log", level: "warn", message: `Certificate transparency lookup failed: ${(e as Error).message}` });
    }
  });

  // Cap candidates to keep the scan bounded and responsible.
  const MAX_HOSTS = 60;
  const candidates = [...new Set(ctHosts)].filter((h) => h !== domain).slice(0, MAX_HOSTS);

  await stage(emit, "dns", async () => {
    const results = await mapPool(candidates, 6, (host) => resolveHost(host));
    let t = 4;
    for (const r of results) {
      const host = r.item;
      const rec = r.value;
      const resolves = !!rec && (rec.a.length > 0 || rec.aaaa.length > 0);
      if (!resolves) continue; // only surface hostnames that resolve publicly
      const kind = classifyKind(host, true);
      const firstSeen = ctHosts.includes(host) ? undefined : now;
      const a = asset({
        kind,
        label: host,
        discoveredVia: ["certificate_transparency", "dns"],
        evidence: [
          ev("certificate_transparency", "crt.sh", "Hostname observed on a public certificate.", undefined, now),
          ev("dns", "DoH", `Resolves publicly (${[...(rec?.a ?? []), ...(rec?.aaaa ?? [])].slice(0, 2).join(", ")}).`, undefined, now),
        ],
        firstObservedAt: firstSeen,
        attrs: { protocols: ["HTTPS"], addresses: [...(rec?.a ?? []), ...(rec?.aaaa ?? [])] },
      });
      assets.push(a);
      const e = edge(root, a, "subdomain_of", 1, [ev("dns", "DoH", "Shares the registrable domain.", undefined, now)]);
      edges.push(e);
      timeline.push({ t: (t += 2), headline: `${host} resolves publicly`, detail: host, revealAssetIds: [a.id], revealEdgeIds: [e.id] });
      await emit({ type: "asset", asset: a });
      await emit({ type: "edge", edge: e });
      await emit({ type: "log", level: "add", message: `${host} discovered` });
    }
  });

  await stage(emit, "correlate", async () => {
    try {
      const mailCfg = await resolveMailAndNs(domain);
      if (mailCfg.mx.length > 0) {
        const mail = asset({
          kind: "mail_service",
          label: mailCfg.mx[0]!,
          discoveredVia: ["dns_mx"],
          evidence: [
            ev("dns_mx", "DoH", `MX record designates ${mailCfg.mx.length} mail exchanger(s).`, undefined, now),
            ev("dns_txt", "DoH", mailCfg.spf === "present" ? "SPF policy present." : "No SPF policy observed.", undefined, now),
          ],
          orgConfidence: 0.9,
          attrs: { protocols: ["SMTP"], spf: mailCfg.spf, mx: mailCfg.mx },
        });
        assets.push(mail);
        const e = edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX record for the root domain.", undefined, now)]);
        edges.push(e);
        await emit({ type: "asset", asset: mail });
        await emit({ type: "edge", edge: e });
        await emit({ type: "log", level: "add", message: "Mail infrastructure identified" });
      }
    } catch (e) {
      await emit({ type: "log", level: "warn", message: `DNS correlation partial: ${(e as Error).message}` });
    }
  });

  const result = finalize(domain, "passive", assets, edges, timeline, linkedFromPrimary, scanId, startedAt);
  await stage(emit, "classify", async () => {
    await emit({ type: "log", level: "signal", message: `${result.stats.shadowAssets} possible shadow asset signal(s), ${result.stats.nonProdSignals} non-production signal(s)` });
  });
  await stage(emit, "score", async () => {
    await emit({ type: "log", level: "info", message: `Exposure score: ${result.score.value}/100` });
  });
  // Terminal `result` event is emitted by the caller after persistence.
  return result;
}
