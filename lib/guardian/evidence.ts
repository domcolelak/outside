import { createHash } from "node:crypto";
import type { Asset, DiscoveryMethod, Evidence, ProviderRun, ScanResult } from "@/lib/types";
import { guardianId } from "./identity";
import type {
  GuardianEvidenceCategory,
  GuardianEvidenceContradiction,
  GuardianEvidenceGraph,
  GuardianEvidenceHistory,
  GuardianEvidenceIntelligence,
  GuardianEvidenceRecord,
  GuardianEvidenceSnapshot,
  GuardianEntityResolution,
  GuardianEvent,
  GuardianProviderAssessment,
  GuardianRecommendation,
} from "./types";

type FindingRef = Pick<GuardianRecommendation | GuardianEvent, "id" | "title" | "affectedAssets" | "confidence"> & { kind: "finding" | "recommendation" | "event" | "target" };
type NormalizedValue = GuardianEvidenceRecord["normalized"]["value"];

const METHOD_RELIABILITY: Record<DiscoveryMethod, number> = {
  seed: 1,
  dns: 0.96,
  dns_txt: 0.95,
  dns_mx: 0.96,
  http_observation: 0.97,
  certificate_transparency: 0.9,
  domain_registration: 0.9,
  technology_fingerprint: 0.76,
  passive_subdomain: 0.72,
  service_observation: 0.78,
  threat_intel: 0.7,
  demo: 0.45,
};

const ATTRIBUTE_CATEGORY: Record<string, GuardianEvidenceCategory> = {
  addresses: "dns", cnames: "dns", nameservers: "dns", dnsProvider: "dns", dnssec: "dns",
  certIssuer: "certificate", certNotAfter: "certificate", certDaysToExpiry: "certificate", certFingerprint: "certificate",
  status: "http", https: "http", tlsValidation: "http", presentHeaders: "http", missingHeaders: "http", redirectLocation: "http", securityTxt: "http", server: "http",
  technologies: "technology",
  spf: "mail", dkim: "mail", dmarc: "mail", mtaSts: "mail", mx: "mail", mailProvider: "mail",
  domainExpiresAt: "registration", domainDaysToExpiry: "registration", registrar: "registration",
  cloudProvider: "provider", cdn: "provider", providerEvidence: "provider",
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function normalizedValue(value: Asset["attrs"][string]): NormalizedValue {
  if (Array.isArray(value)) return [...new Set(value.map(String))].sort();
  return value;
}

function displayValue(value: NormalizedValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function providerStatusFactor(status: GuardianProviderAssessment["status"]): number {
  return status === "ok" ? 1 : status === "partial" ? 0.82 : status === "not_reported" ? 0.78 : status === "skipped" ? 0.6 : 0.35;
}

function assessProviders(result: ScanResult): GuardianProviderAssessment[] {
  const grouped = new Map<string, ProviderRun[]>();
  const attributedMethods = new Map<string, Set<DiscoveryMethod>>();
  for (const run of result.providerRuns) grouped.set(run.provider, [...(grouped.get(run.provider) ?? []), run]);
  for (const asset of result.graph.assets) {
    for (const evidence of asset.evidence) {
      if (!grouped.has(evidence.provider)) grouped.set(evidence.provider, []);
      attributedMethods.set(evidence.provider, new Set([...(attributedMethods.get(evidence.provider) ?? []), evidence.method]));
    }
  }
  return [...grouped.entries()].map(([provider, runs]) => {
    const methods = [...new Set([...runs.map((run) => run.method), ...(attributedMethods.get(provider) ?? [])])].sort();
    const statuses = runs.map((run) => run.status);
    const status: GuardianProviderAssessment["status"] = !runs.length ? "not_reported" : statuses.every((item) => item === "ok") ? "ok" : statuses.some((item) => item === "error") && !statuses.some((item) => item === "ok" || item === "partial") ? "error" : statuses.every((item) => item === "skipped") ? "skipped" : "partial";
    const base = methods.length ? methods.reduce((sum, method) => sum + METHOD_RELIABILITY[method], 0) / methods.length : 0.8;
    const reliability = Number((base * providerStatusFactor(status)).toFixed(3));
    const observations = runs.reduce((sum, run) => sum + run.observations, 0);
    const explanation = runs.length
      ? `${provider} reported ${observations} observation(s) across ${methods.join(", ") || "an unspecified method"}; run status was ${status}.`
      : `${provider} is attributed by an immutable asset observation; no separate provider run telemetry was recorded.`;
    return { provider, methods, status, reliability, observations, explanation };
  }).sort((a, b) => a.provider.localeCompare(b.provider));
}

function methodForCategory(category: GuardianEvidenceCategory): DiscoveryMethod {
  if (category === "dns") return "dns";
  if (category === "certificate") return "certificate_transparency";
  if (category === "http") return "http_observation";
  if (category === "technology") return "technology_fingerprint";
  if (category === "mail") return "dns_mx";
  if (category === "registration") return "domain_registration";
  return "seed";
}

function evidenceForAttribute(asset: Asset, key: string, category: GuardianEvidenceCategory): Evidence | undefined {
  if (["spf", "dkim", "dmarc", "mtaSts"].includes(key)) return asset.evidence.find((item) => item.method === "dns_txt");
  if (["mx", "mailProvider"].includes(key)) return asset.evidence.find((item) => item.method === "dns_mx");
  const methods: Partial<Record<GuardianEvidenceCategory, DiscoveryMethod[]>> = {
    dns: ["dns"], certificate: ["http_observation", "certificate_transparency"], http: ["http_observation"], technology: ["technology_fingerprint"],
    mail: ["dns_mx", "dns_txt"], registration: ["domain_registration"], provider: ["dns", "http_observation", "technology_fingerprint"],
  };
  return asset.evidence.find((item) => methods[category]?.includes(item.method));
}

function record(input: Omit<GuardianEvidenceRecord, "id" | "contentHash">): GuardianEvidenceRecord {
  const contentHash = hash(input);
  return { ...input, id: guardianId("evidence", input.scanId, input.entityId, input.normalized.key, contentHash), contentHash };
}

function providerReliability(providers: GuardianProviderAssessment[], provider: string, method: DiscoveryMethod): number {
  return providers.find((item) => item.provider === provider)?.reliability ?? METHOD_RELIABILITY[method] * 0.78;
}

function assetRecords(result: ScanResult, asset: Asset, providers: GuardianProviderAssessment[]): GuardianEvidenceRecord[] {
  const findingIds = result.findings.filter((finding) => finding.assetId === asset.id).map((finding) => finding.id).sort();
  const path = [...new Set(asset.discoveredVia)];
  const rows: GuardianEvidenceRecord[] = [];
  for (const [index, evidence] of asset.evidence.entries()) {
    const reliability = providerReliability(providers, evidence.provider, evidence.method);
    rows.push(record({
      scanId: result.scanId, subject: asset.canonical, entityId: asset.id, category: evidence.method === "technology_fingerprint" ? "technology" : evidence.method === "domain_registration" ? "registration" : evidence.method.startsWith("dns") ? (evidence.method === "dns_mx" || evidence.method === "dns_txt" ? "mail" : "dns") : evidence.method === "http_observation" ? "http" : "discovery",
      method: evidence.method, provider: evidence.provider, assurance: "observed", summary: evidence.summary, observedAt: evidence.observedAt,
      rawObservation: { summary: evidence.summary, ...(evidence.detail ? { detail: evidence.detail } : {}) },
      normalized: { key: `observation.${evidence.method}.${index}`, value: evidence.detail ? `${evidence.summary} ${evidence.detail}` : evidence.summary },
      discoveryPath: path, provenance: { origin: "scan_asset", sourceId: asset.id, collectedAt: evidence.observedAt }, providerConfidence: reliability,
      evidenceScore: Number((reliability * 0.82 * asset.orgConfidence).toFixed(3)), findingIds,
    }));
  }
  for (const [key, value] of Object.entries(asset.attrs).sort(([a], [b]) => a.localeCompare(b))) {
    const category = ATTRIBUTE_CATEGORY[key];
    if (!category) continue;
    const source = evidenceForAttribute(asset, key, category);
    const method = source?.method ?? methodForCategory(category);
    const provider = source?.provider ?? result.providerRuns.find((run) => run.method === method)?.provider ?? "OUTSIDE normalization";
    const reliability = providerReliability(providers, provider, method);
    const normalized = normalizedValue(value);
    rows.push(record({
      scanId: result.scanId, subject: asset.canonical, entityId: asset.id, category, method, provider, assurance: "normalized",
      summary: `${key}: ${displayValue(normalized)}`, observedAt: asset.lastObservedAt,
      rawObservation: { attribute: key, value, sourceEvidence: source ? { method: source.method, provider: source.provider, summary: source.summary, ...(source.detail ? { detail: source.detail } : {}) } : null },
      normalized: { key, value: normalized }, discoveryPath: path,
      provenance: { origin: "scan_asset", sourceId: asset.id, collectedAt: asset.lastObservedAt }, providerConfidence: reliability,
      evidenceScore: Number((reliability * 0.98 * asset.orgConfidence).toFixed(3)), findingIds,
    }));
  }
  return rows;
}

export function createEvidenceSnapshot(orgId: string, result: ScanResult): GuardianEvidenceSnapshot {
  const providers = assessProviders(result);
  const records = result.graph.assets.flatMap((asset) => assetRecords(result, asset, providers));
  for (const run of result.providerRuns) {
    const assessment = providers.find((provider) => provider.provider === run.provider);
    records.push(record({
      scanId: result.scanId, subject: result.target, entityId: `provider:${hash(run.provider).slice(0, 20)}`, category: "provider", method: run.method, provider: run.provider,
      assurance: "observed", summary: `${run.provider} ${run.status}: ${run.observations} observation(s).`, observedAt: run.finishedAt,
      rawObservation: { status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, observations: run.observations, errors: run.errors.slice(0, 20) },
      normalized: { key: `providerRun.${run.method}.status`, value: run.status }, discoveryPath: [run.method],
      provenance: { origin: "provider_run", sourceId: `${run.provider}:${run.method}`, collectedAt: run.finishedAt },
      providerConfidence: assessment?.reliability ?? METHOD_RELIABILITY[run.method], evidenceScore: assessment?.reliability ?? METHOD_RELIABILITY[run.method], findingIds: [],
    }));
  }
  for (const edge of result.graph.edges) {
    for (const [index, evidence] of edge.evidence.entries()) {
      const reliability = providerReliability(providers, evidence.provider, evidence.method);
      records.push(record({
        scanId: result.scanId, subject: edge.from, entityId: edge.to, category: "identity", method: evidence.method, provider: evidence.provider,
        assurance: "normalized", summary: evidence.summary, observedAt: evidence.observedAt,
        rawObservation: { from: edge.from, to: edge.to, kind: edge.kind, confidence: edge.confidence, summary: evidence.summary, ...(evidence.detail ? { detail: evidence.detail } : {}) },
        normalized: { key: `edge.${edge.kind}.${index}`, value: edge.to }, discoveryPath: [evidence.method],
        provenance: { origin: "scan_edge", sourceId: edge.id, collectedAt: evidence.observedAt }, providerConfidence: reliability,
        evidenceScore: Number((reliability * edge.confidence).toFixed(3)), findingIds: [],
      }));
    }
  }
  const entities: GuardianEntityResolution[] = result.graph.assets.map((asset) => ({
    entityId: asset.id, canonical: asset.canonical, label: asset.label, kind: asset.kind, confidence: asset.orgConfidence,
    explanation: `Resolved to stable entity ${asset.id} from canonical ${asset.kind} identifier “${asset.canonical}”; organization confidence is ${Math.round(asset.orgConfidence * 100)}%.`,
    discoveryPath: [...new Set(asset.discoveredVia)],
  })).sort((a, b) => a.canonical.localeCompare(b.canonical));
  records.sort((a, b) => a.subject.localeCompare(b.subject) || a.normalized.key.localeCompare(b.normalized.key) || a.id.localeCompare(b.id));
  const findings = result.findings.map((finding) => ({ id: finding.id, title: finding.title, confidence: finding.confidence, assetId: finding.assetId, asset: result.graph.assets.find((asset) => asset.id === finding.assetId)?.canonical ?? finding.assetId }));
  const sealed = { orgId, target: result.target, scanId: result.scanId, observedAt: result.finishedAt, records, providers, entities, findings };
  const contentHash = hash(sealed);
  return { id: guardianId("evidence-snapshot", orgId, result.scanId, contentHash), ...sealed, contentHash, recordCount: records.length };
}

function relevantRecords(snapshot: GuardianEvidenceSnapshot, affectedAssets: string[]): GuardianEvidenceRecord[] {
  if (!affectedAssets.length) return snapshot.records;
  const subjects = new Set(affectedAssets.map((item) => item.toLowerCase()));
  const entityIds = new Set(snapshot.entities.filter((entity) => subjects.has(entity.canonical.toLowerCase()) || subjects.has(entity.label.toLowerCase())).map((entity) => entity.entityId));
  return snapshot.records.filter((item) => subjects.has(item.subject.toLowerCase()) || entityIds.has(item.entityId));
}

function detectContradictions(records: GuardianEvidenceRecord[]): GuardianEvidenceContradiction[] {
  const groups = new Map<string, GuardianEvidenceRecord[]>();
  for (const item of records.filter((row) => row.assurance === "normalized")) {
    const key = `${item.subject}\u0000${item.normalized.key}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result: GuardianEvidenceContradiction[] = [];
  for (const rows of groups.values()) {
    const values = new Map(rows.map((item) => [canonicalize(item.normalized.value), item]));
    const providers = new Set(rows.map((item) => item.provider));
    if (values.size < 2 || providers.size < 2) continue;
    const first = rows[0]!;
    result.push({ subject: first.subject, key: first.normalized.key, values: [...values.entries()].map(([value, item]) => ({ value, provider: item.provider, recordId: item.id })), explanation: `Independent providers reported different normalized values for ${first.normalized.key}; Guardian keeps both and lowers confidence instead of selecting one.` });
  }
  return result;
}

function requiredCategories(finding: FindingRef): GuardianEvidenceCategory[] {
  const text = `${finding.id} ${finding.title}`.toLowerCase();
  const required: GuardianEvidenceCategory[] = ["discovery"];
  if (/dns|host|asset|surface|shadow|infrastructure|provider|cloud|cdn/.test(text)) required.push("dns");
  if (/certificate|tls|https|hsts/.test(text)) required.push("certificate", "http");
  if (/mail|spf|dkim|dmarc|mta/.test(text)) required.push("mail");
  if (/technology|server/.test(text)) required.push("technology");
  if (/login|auth|api|staging|redirect/.test(text)) required.push("http");
  return [...new Set(required)];
}

function histories(snapshots: GuardianEvidenceSnapshot[], subjects: Set<string>): GuardianEvidenceHistory[] {
  const tracks = new Map<string, GuardianEvidenceHistory>();
  for (const snapshot of snapshots.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))) {
    for (const item of snapshot.records) {
      if (!subjects.has(item.subject) || !(["dns", "certificate", "http", "technology"] as GuardianEvidenceCategory[]).includes(item.category)) continue;
      if (item.normalized.key.startsWith("observation.")) continue;
      const key = `${item.category}\u0000${item.subject}\u0000${item.normalized.key}`;
      const track = tracks.get(key) ?? { category: item.category as GuardianEvidenceHistory["category"], subject: item.subject, key: item.normalized.key, points: [] };
      const value = displayValue(item.normalized.value);
      const previous = track.points.at(-1);
      track.points.push({ observedAt: snapshot.observedAt, scanId: snapshot.scanId, value, provider: item.provider, changed: !!previous && previous.value !== value });
      tracks.set(key, track);
    }
  }
  return [...tracks.values()].filter((track) => track.points.length > 0).slice(0, 80);
}

function evidenceGraph(finding: FindingRef, records: GuardianEvidenceRecord[], entities: GuardianEntityResolution[], contradictions: GuardianEvidenceContradiction[]): GuardianEvidenceGraph {
  const nodes: GuardianEvidenceGraph["nodes"] = [{ id: `finding:${finding.id}`, kind: "finding", label: finding.title, confidence: finding.confidence }];
  const edges: GuardianEvidenceGraph["edges"] = [];
  const entityIds = new Set(records.map((item) => item.entityId));
  for (const entity of entities.filter((item) => entityIds.has(item.entityId))) {
    nodes.push({ id: `entity:${entity.entityId}`, kind: "entity", label: entity.label, confidence: entity.confidence });
    edges.push({ id: guardianId("evidence-edge", finding.id, entity.entityId), from: `entity:${entity.entityId}`, to: `finding:${finding.id}`, kind: "supports" });
  }
  for (const item of records.filter((record) => !entities.some((entity) => entity.entityId === record.entityId))) {
    if (nodes.some((node) => node.id === `entity:${item.entityId}`)) continue;
    nodes.push({ id: `entity:${item.entityId}`, kind: "entity", label: item.subject, confidence: item.evidenceScore });
    edges.push({ id: guardianId("evidence-edge", finding.id, item.entityId), from: `entity:${item.entityId}`, to: `finding:${finding.id}`, kind: "supports" });
  }
  for (const item of records.slice(0, 80)) {
    nodes.push({ id: `observation:${item.id}`, kind: "observation", label: item.summary, confidence: item.evidenceScore });
    edges.push({ id: guardianId("evidence-edge", item.id, item.entityId), from: `observation:${item.id}`, to: `entity:${item.entityId}`, kind: "supports" });
    const providerId = `provider:${hash(item.provider).slice(0, 16)}`;
    if (!nodes.some((node) => node.id === providerId)) nodes.push({ id: providerId, kind: "provider", label: item.provider, confidence: item.providerConfidence });
    edges.push({ id: guardianId("evidence-edge", item.id, providerId), from: providerId, to: `observation:${item.id}`, kind: "observed_by" });
  }
  for (const contradiction of contradictions) {
    for (const value of contradiction.values) edges.push({ id: guardianId("evidence-edge", value.recordId, "contradicts"), from: `observation:${value.recordId}`, to: `finding:${finding.id}`, kind: "contradicts" });
  }
  return { nodes, edges };
}

export function explainEvidence(snapshot: GuardianEvidenceSnapshot, history: GuardianEvidenceSnapshot[], finding: FindingRef): GuardianEvidenceIntelligence {
  const records = relevantRecords(snapshot, finding.affectedAssets);
  const contradictions = detectContradictions(records);
  const categories = new Set(records.map((item) => item.category));
  const required = requiredCategories(finding);
  const missingEvidence = required.filter((category) => !categories.has(category)).map((category) => `No deterministic ${category} observation was captured for the affected asset(s) in scan ${snapshot.scanId}.`);
  for (const provider of snapshot.providers.filter((item) => item.status === "error" || item.status === "skipped")) missingEvidence.push(`${provider.provider} was ${provider.status}; evidence from ${provider.methods.join(", ") || "that provider"} is unavailable for this snapshot.`);
  const uniqueSources = new Set(records.map((item) => `${item.provider}\u0000${item.method}`));
  const average = records.length ? records.reduce((sum, item) => sum + item.evidenceScore, 0) / records.length : 0;
  const correlationBonus = Math.min(0.08, Math.max(0, uniqueSources.size - 1) * 0.02);
  const confidence = Number(Math.max(0, Math.min(finding.confidence, average + correlationBonus - contradictions.length * 0.12 - missingEvidence.length * 0.025)).toFixed(3));
  const correlations: string[] = [];
  const bySubject = new Map<string, GuardianEvidenceRecord[]>();
  for (const item of records) bySubject.set(item.subject, [...(bySubject.get(item.subject) ?? []), item]);
  for (const [subject, rows] of bySubject) {
    const sources = new Set(rows.map((item) => `${item.provider} (${item.method})`));
    if (sources.size > 1) correlations.push(`${subject} is supported by ${sources.size} independent provider/method paths: ${[...sources].join(", ")}.`);
  }
  if (!correlations.length) correlations.push("Only one provider/method path currently supports this finding; Guardian has not treated that as multi-source confirmation.");
  const subjects = new Set(records.map((item) => item.subject));
  const allHistory = [...history.filter((item) => item.scanId !== snapshot.scanId), snapshot].slice(-40);
  const historyTracks = histories(allHistory, subjects);
  const timeline = allHistory.flatMap((item) => {
    const itemRecords = relevantRecords(item, [...subjects]);
    if (!itemRecords.length) return [];
    const changed = historyTracks.some((track) => track.points.some((point) => point.scanId === item.scanId && point.changed));
    return [{ observedAt: item.observedAt, scanId: item.scanId, type: changed ? "changed" as const : "observed" as const, summary: `${itemRecords.length} supporting observation(s) ${changed ? "included a normalized value change" : "were retained without a detected value change"}.`, recordIds: itemRecords.map((row) => row.id).slice(0, 100) }];
  });
  const relevantEntities = snapshot.entities.filter((entity) => subjects.has(entity.canonical) || records.some((record) => record.entityId === entity.entityId));
  const providers = snapshot.providers.filter((provider) => records.some((record) => record.provider === provider.provider));
  const whyWeBelieveThis = records.length
    ? `${records.length} immutable deterministic observation(s) from ${uniqueSources.size} provider/method path(s) support the affected entities. ${correlations[0]}`
    : "No deterministic observation in the selected immutable snapshot supports this finding; confidence is therefore zero.";
  return {
    finding: { id: finding.id, title: finding.title, kind: finding.kind },
    snapshot: { id: snapshot.id, scanId: snapshot.scanId, observedAt: snapshot.observedAt, contentHash: snapshot.contentHash, immutable: true },
    whyWeBelieveThis, confidence, evidenceScore: Number((average * 100).toFixed(1)),
    confidenceExplanation: `Confidence is capped by the finding’s ${Math.round(finding.confidence * 100)}% deterministic confidence, weighted by source reliability and observation specificity${correlationBonus ? `, with a ${Math.round(correlationBonus * 100)} point multi-source bonus` : ""}${contradictions.length ? `, and reduced for ${contradictions.length} contradiction(s)` : ""}${missingEvidence.length ? ` and ${missingEvidence.length} evidence gap(s)` : ""}.`,
    supportingEvidence: records.slice(0, 250), contradictions, missingEvidence, correlations, providers,
    entityResolution: relevantEntities, timeline, history: historyTracks,
    graph: evidenceGraph(finding, records, relevantEntities, contradictions),
  };
}
