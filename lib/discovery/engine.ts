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
import { SCAN_STAGE_LABELS } from "@/lib/discovery/stages";
import type {
  Asset,
  AssetKind,
  AttackerBeat,
  Edge,
  ScanEvent,
  ScanResult,
  ScanStats,
  ProviderRun,
} from "@/lib/types";
import { mapPool } from "./net";
import { certificateTransparency, domainRegistration, resolveHost, resolveMailAndNs } from "./providers";
import type { CtHostname } from "./providers";
import { observeHttp } from "./http";
import { asset, edge, ev, resetSeq } from "@/lib/demo/factory";

export type Emit = (event: ScanEvent) => void | Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function stage(emit: Emit, s: keyof typeof SCAN_STAGE_LABELS, work: () => Promise<void>) {
  await emit({ type: "stage", stage: s, label: SCAN_STAGE_LABELS[s], status: "start" });
  await work();
  await emit({ type: "stage", stage: s, label: SCAN_STAGE_LABELS[s], status: "done" });
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
  providerRuns: ProviderRun[] = [],
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
    providerRuns,
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
export async function runPassiveScan(
  domain: string,
  scanId: string,
  emit: Emit,
  options: { activeObservation?: boolean; signal?: AbortSignal } = {},
): Promise<ScanResult> {
  resetSeq();
  const startedAt = new Date().toISOString();
  const reg = registrableDomain(domain);
  const now = new Date().toISOString();
  const signal = options.signal;
  const providerRuns: ProviderRun[] = [];
  signal?.throwIfAborted();

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

  let ctHosts: CtHostname[] = [];
  await stage(emit, "certificates", async () => {
    const started = new Date();
    const [certificateResult, registrationResult] = await Promise.allSettled([
      certificateTransparency(domain, signal),
      domainRegistration(domain, signal),
    ]);
    signal?.throwIfAborted();
    if (certificateResult.status === "fulfilled") {
      ctHosts = certificateResult.value;
      providerRuns.push({ provider: "crt.sh", method: "certificate_transparency", status: "ok", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: ctHosts.length, errors: [] });
      await emit({ type: "log", level: "info", message: `${ctHosts.length} candidate hostname(s) from certificate transparency` });
    } else {
      providerRuns.push({ provider: "crt.sh", method: "certificate_transparency", status: "error", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: 0, errors: [(certificateResult.reason as Error).message] });
      await emit({ type: "log", level: "warn", message: `Certificate transparency lookup failed: ${(certificateResult.reason as Error).message}` });
    }
    if (registrationResult.status === "fulfilled") {
      const registration = registrationResult.value;
      if (registration.expiresAt) root.attrs.domainExpiresAt = registration.expiresAt;
      if (typeof registration.daysToExpiry === "number") root.attrs.domainDaysToExpiry = registration.daysToExpiry;
      if (registration.registrar) root.attrs.registrar = registration.registrar;
      providerRuns.push({ provider: "RDAP bootstrap", method: "domain_registration", status: registration.expiresAt ? "ok" : "partial", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: registration.expiresAt ? 1 : 0, errors: [] });
    } else {
      providerRuns.push({ provider: "RDAP bootstrap", method: "domain_registration", status: "error", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: 0, errors: [(registrationResult.reason as Error).message] });
    }
  });

  // Cap candidates to keep the scan bounded and responsible.
  const MAX_HOSTS = Math.max(1, Math.min(200, Number(process.env.OUTSIDE_MAX_HOSTS_PER_SCAN ?? 60) || 60));
  const ctByHost = new Map(ctHosts.map((row) => [row.host, row]));
  const candidates = [...ctByHost.keys()].filter((host) => host !== domain).slice(0, MAX_HOSTS);

  await stage(emit, "dns", async () => {
    const started = new Date();
    const results = await mapPool([domain, ...candidates], 6, (host) => resolveHost(host, signal), signal);
    const errors = results.filter((item) => item.error).map((item) => (item.error as Error).message).slice(0, 20);
    providerRuns.push({ provider: "Cloudflare DoH", method: "dns", status: errors.length ? "partial" : "ok", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: results.filter((item) => item.value).length, errors });
    let t = 4;
    for (const r of results) {
      const host = r.item;
      const rec = r.value;
      const resolves = !!rec && (rec.a.length > 0 || rec.aaaa.length > 0);
      if (!resolves) continue; // only surface hostnames that resolve publicly
      if (host === domain) {
        root.attrs.addresses = [...rec.a, ...rec.aaaa];
        root.evidence.push(ev("dns", "DoH", `Root domain resolves publicly (${[...rec.a, ...rec.aaaa].slice(0, 2).join(", ")}).`, undefined, now));
        continue;
      }
      const kind = classifyKind(host, true);
      const firstSeen = ctByHost.get(host)?.firstSeen;
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
    const started = new Date();
    try {
      const mailCfg = await resolveMailAndNs(domain, signal);
      root.attrs.nameservers = mailCfg.ns;
      root.attrs.dnssec = mailCfg.dnssec;
      if (mailCfg.dnsProvider) root.attrs.dnsProvider = mailCfg.dnsProvider;
      root.evidence.push(ev("dns", "DoH", `Observed ${mailCfg.ns.length} authoritative nameserver(s); DNSSEC DS ${mailCfg.dnssec}.`, mailCfg.dnsProvider ? `provider signal: ${mailCfg.dnsProvider}` : undefined, now));
      providerRuns.push({ provider: "Cloudflare DoH", method: "dns_mx", status: "ok", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: mailCfg.mx.length + mailCfg.ns.length + 4, errors: [] });
      if (mailCfg.mx.length > 0 || [mailCfg.spf, mailCfg.dmarc, mailCfg.mtaSts].some((value) => value !== "missing")) {
        const mail = asset({
          kind: "mail_service",
          label: `mail:${reg}`,
          discoveredVia: ["dns_mx", "dns_txt"],
          evidence: [
            ev("dns_mx", "DoH", `MX record designates ${mailCfg.mx.length} mail exchanger(s).`, undefined, now),
            ev("dns_txt", "DoH", mailCfg.spf === "present" ? "SPF policy present." : "No SPF policy observed.", undefined, now),
            ev("dns_txt", "DoH", `DMARC policy state: ${mailCfg.dmarc}; MTA-STS TXT state: ${mailCfg.mtaSts}.`, undefined, now),
          ],
          orgConfidence: 0.9,
          attrs: { protocols: ["SMTP"], spf: mailCfg.spf, dmarc: mailCfg.dmarc, mtaSts: mailCfg.mtaSts, mx: mailCfg.mx, ...(mailCfg.mailProvider ? { mailProvider: mailCfg.mailProvider } : {}) },
        });
        assets.push(mail);
        const e = edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX record for the root domain.", undefined, now)]);
        edges.push(e);
        await emit({ type: "asset", asset: mail });
        await emit({ type: "edge", edge: e });
        await emit({ type: "log", level: "add", message: "Mail infrastructure identified" });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      providerRuns.push({ provider: "Cloudflare DoH", method: "dns_mx", status: "error", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: 0, errors: [(e as Error).message] });
      await emit({ type: "log", level: "warn", message: `DNS correlation partial: ${(e as Error).message}` });
    }
  });

  // HTTP + TLS observation of the primary web surface (headers + certificate).
  await stage(emit, "http", async () => {
    if (!options.activeObservation) {
      providerRuns.push({ provider: "Target HTTPS", method: "http_observation", status: "skipped", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), observations: 0, errors: [] });
      await emit({ type: "log", level: "info", message: "Active HTTPS observation skipped until ownership is verified" });
      return;
    }
    const primary = assets.find((a) => a.canonical === `www.${reg}`) ?? assets.find((a) => a.kind === "web_service") ?? root;
    const started = new Date();
    try {
      const obs = await observeHttp(primary.canonical, signal);
      providerRuns.push({ provider: "Target HTTPS", method: "http_observation", status: obs ? "ok" : "partial", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: obs ? 1 : 0, errors: [] });
      if (obs) {
        primary.attrs.missingHeaders = obs.missingHeaders;
        primary.attrs.presentHeaders = obs.presentHeaders;
        if (obs.server) primary.attrs.server = obs.server;
        if (obs.status) primary.attrs.status = String(obs.status);
        primary.attrs.https = obs.httpsVerified ? "observed" : "unverified";
        primary.attrs.tlsValidation = obs.httpsVerified ? "valid" : "unverified";
        primary.attrs.securityTxt = obs.securityTxt;
        if (obs.redirectLocation) primary.attrs.redirectLocation = obs.redirectLocation;
        if (!primary.discoveredVia.includes("http_observation")) primary.discoveredVia.push("http_observation");
        if (obs.cert?.issuer) primary.attrs.certIssuer = obs.cert.issuer;
        if (obs.cert?.validTo) primary.attrs.certNotAfter = obs.cert.validTo;
        if (typeof obs.cert?.daysToExpiry === "number") primary.attrs.certDaysToExpiry = obs.cert.daysToExpiry;
        if (obs.cert?.fingerprint) primary.attrs.certFingerprint = obs.cert.fingerprint;
        primary.evidence.push(
          ev(
            "http_observation",
            "HttpObservation",
            `${primary.label} responded${obs.status ? ` (${obs.status})` : ""} with ${obs.missingHeaders.length} baseline security header(s) absent${
              typeof obs.cert?.daysToExpiry === "number" ? `; certificate valid for ${obs.cert.daysToExpiry} more day(s)` : ""
            }.`,
            obs.server ? `server: ${obs.server}` : undefined,
            now,
          ),
        );
        await emit({
          type: "log",
          level: obs.missingHeaders.length >= 2 ? "signal" : "info",
          message: `${primary.label} observed — ${obs.missingHeaders.length} security header(s) missing`,
        });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      providerRuns.push({ provider: "Target HTTPS", method: "http_observation", status: "error", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), observations: 0, errors: [(e as Error).message] });
      await emit({ type: "log", level: "warn", message: `HTTP observation skipped: ${(e as Error).message}` });
    }
  });

  const result = finalize(domain, "passive", assets, edges, timeline, linkedFromPrimary, scanId, startedAt, providerRuns);
  await stage(emit, "classify", async () => {
    await emit({ type: "log", level: "signal", message: `${result.stats.shadowAssets} possible shadow asset signal(s), ${result.stats.nonProdSignals} non-production signal(s)` });
  });
  await stage(emit, "score", async () => {
    await emit({ type: "log", level: "info", message: `Exposure score: ${result.score.value}/100` });
  });
  // Terminal `result` event is emitted by the caller after persistence.
  return result;
}
