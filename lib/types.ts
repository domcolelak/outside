/**
 * OUTSIDE domain model.
 *
 * The pipeline deliberately separates epistemic layers so the UI can never
 * present an uncertain inference as a confirmed fact:
 *
 *   RawObservation  -> what a provider literally saw (fact)
 *   Asset / Edge    -> normalized, entity-resolved graph
 *   Signal          -> an inference derived from evidence (may be wrong)
 *   Finding         -> a reviewable concern built from signals + evidence
 *   ScoreComponent  -> a transparent contribution to the protection-posture score
 *
 * Every inference carries a confidence and cites the evidence it rests on.
 */

export type Assurance = "observed" | "inferred" | "possible";

export type AssetKind =
  | "root_domain"
  | "subdomain"
  | "host"
  | "ip"
  | "web_service"
  | "mail_service"
  | "dns_provider"
  | "nameserver"
  | "certificate"
  | "cloud_provider"
  | "cdn"
  | "technology"
  | "auth_surface"
  | "api_surface"
  | "third_party"
  | "unknown";

export type EdgeKind =
  | "resolves_to"
  | "subdomain_of"
  | "serves"
  | "mail_for"
  | "delegated_to"
  | "certified_by"
  | "fronted_by"
  | "runs"
  | "depends_on"
  | "same_org";

export type DiscoveryMethod =
  | "certificate_transparency"
  | "dns"
  | "dns_txt"
  | "dns_mx"
  | "http_observation"
  | "technology_fingerprint"
  | "passive_subdomain"
  | "service_observation"
  | "domain_registration"
  | "threat_intel"
  /** Matching a discovered hostname against accounts the customer owns. */
  | "ownership_attribution"
  | "seed"
  | "demo";

/** A single literal thing a provider saw. Never mutated after creation. */
export interface RawObservation {
  id: string;
  method: DiscoveryMethod;
  provider: string;
  /** The subject this observation is about, in raw provider form. */
  subject: string;
  /** Machine-readable payload, provider-specific but normalized keys. */
  data: Record<string, unknown>;
  observedAt: string; // ISO
}

export interface Evidence {
  method: DiscoveryMethod;
  provider: string;
  summary: string;
  detail?: string;
  observedAt: string;
}

export type Priority = "info" | "low" | "medium" | "high" | "critical";

export interface Signal {
  code: string;
  label: string;
  assurance: Assurance;
  confidence: number; // 0..1
  rationale: string;
  /**
   * The classifier's own description of what it matched, kept separately from
   * the label so a finding can put it inside a translated sentence rather than
   * parsing it back out of English prose.
   */
  token?: string;
}

export interface Asset {
  /** Stable identity key across scans (see entity resolution). */
  id: string;
  kind: AssetKind;
  /** Canonical human label, e.g. "staging.acme.com". */
  label: string;
  /** Canonical form used for identity, e.g. lowercased FQDN without trailing dot. */
  canonical: string;
  firstObservedAt: string;
  lastObservedAt: string;
  discoveredVia: DiscoveryMethod[];
  evidence: Evidence[];
  signals: Signal[];
  /** Derived review priority for this specific asset. */
  priority: Priority;
  /** Overall confidence that this asset belongs to the target org. */
  orgConfidence: number; // 0..1
  attrs: Record<string, string | string[] | number | boolean>;
}

export interface Edge {
  id: string;
  from: string; // Asset.id
  to: string; // Asset.id
  kind: EdgeKind;
  confidence: number; // 0..1
  evidence: Evidence[];
}

/**
 * Stable identifier for a finding's wording, translated at render time.
 *
 * Findings are generated from evidence and then persisted and replayed, so the
 * English prose stays on the record and this key sits beside it. A finding
 * written before localization — or by a generator not yet keyed — still renders
 * its original English rather than a bare key.
 */
export type FindingTextKey =
  | "shadowAsset"
  | "nonProdExposure"
  | "authSurface"
  | "newAsset"
  | "mailSecurity"
  // Enrichment-only generators: these fire on verified targets, or when an
  // operator's provider key is configured, so many scans never produce them.
  | "missingHeaders"
  | "httpsDowngrade"
  | "certExpired"
  | "certExpiring"
  | "domainLapsed"
  | "domainExpiring"
  | "exposedDatastore"
  | "exposedAdminService"
  | "concentration"
  | "adverseReputation"
  | "maliciousAddress"
  | "domainFlagged"
  | "breachExposure"
  // The curated advisory set. Its title, summary and recommendation vary per
  // entry and are resolved from the advisory reference, not from this key.
  | "vulnerability";

export interface Finding {
  id: string;
  title: string;
  priority: Priority;
  confidence: number; // 0..1
  assetId: string;
  category: string;
  observation: string; // fact
  inference?: string; // signal
  concern: string; // possible risk
  reasoning: string;
  recommendation: string;
  /** Key for title/observation/concern/recommendation. Absent = English only. */
  textKey?: FindingTextKey;
  /** Evidence values the sentences interpolate — hostnames, never translated. */
  textValues?: Record<string, string | number>;
  evidence: Evidence[];
  discoveryMethod: DiscoveryMethod;
  createdAt: string;
}

export interface ScoreComponent {
  code: string;
  label: string;
  /** Negative = increases exposure, positive = mitigates. */
  impact: number;
  detail: string;
}

export interface ExposureScore {
  /** 0 (highly exposed) .. 100 (well-managed external surface). */
  value: number;
  band: "guarded" | "moderate" | "elevated" | "exposed";
  components: ScoreComponent[];
  explanation: string;
}

export interface AssetGraph {
  assets: Asset[];
  edges: Edge[];
}

export interface ScanResult {
  scanId: string;
  target: string;
  mode: "passive" | "demo";
  isDemo: boolean;
  startedAt: string;
  finishedAt: string;
  graph: AssetGraph;
  findings: Finding[];
  score: ExposureScore;
  timeline: AttackerBeat[];
  providerRuns: ProviderRun[];
  stats: ScanStats;
  /** Short-lived server proof required to create an authentic public share. */
  shareProof?: string;
  /** Discovery completeness — whether any provider failed and, if so, whether the failure was in a discovery stage (making the asset surface potentially incomplete). Optional for reconstructed/synthetic results. */
  coverage?: ScanCoverage;
  /** Diff against the target's previous scan, present once history exists. */
  changeSummary?: import("@/lib/persistence/model").ChangeSummary;
  /** Aegis protection posture: recommendations + potential score. */
  posture?: import("@/lib/aegis/types").Posture;
  /** Aegis investigation: correlated exposure incidents + assessment. */
  investigation?: import("@/lib/aegis/investigation").Investigation;
}

export interface ScanStats {
  assets: number;
  webSurfaces: number;
  shadowAssets: number;
  highPriorityFindings: number;
  nonProdSignals: number;
}

export interface ScanCoverage {
  /** Every provider that ran completed without an error or partial result. */
  complete: boolean;
  /** No discovery-stage provider errored or returned a partial result. */
  discoveryComplete: boolean;
  /** Providers that errored or returned partial data, with a short reason. */
  failed: Array<{ provider: string; method: DiscoveryMethod; error: string }>;
}

/** A single beat in the Attacker View cinematic replay. */
export interface AttackerBeat {
  t: number; // seconds into the replay
  headline: string;
  detail: string;
  revealAssetIds: string[];
  revealEdgeIds: string[];
  emphasis?: "normal" | "signal" | "shadow";
}

export interface ProviderRun {
  provider: string;
  method: DiscoveryMethod;
  status: "ok" | "partial" | "error" | "skipped";
  startedAt: string;
  finishedAt: string;
  observations: number;
  errors: string[];
}

/* ---- Live scan streaming (SSE) event contract ---- */

export type ScanStage =
  | "init"
  | "dns"
  | "certificates"
  | "correlate"
  | "http"
  | "normalize"
  | "graph"
  | "classify"
  | "score"
  | "done";

export interface StageEvent {
  type: "stage";
  stage: ScanStage;
  label: string;
  status: "start" | "done";
}

export interface LogEvent {
  type: "log";
  level: "info" | "add" | "signal" | "warn";
  message: string;
}

export interface AssetEvent {
  type: "asset";
  asset: Asset;
}

export interface EdgeEvent {
  type: "edge";
  edge: Edge;
}

export interface ResultEvent {
  type: "result";
  result: ScanResult;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ScanEvent =
  | StageEvent
  | LogEvent
  | AssetEvent
  | EdgeEvent
  | ResultEvent
  | ErrorEvent;
