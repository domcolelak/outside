/**
 * Asset-level signal detection.
 *
 * Signals are *inferences*, never facts. Each carries an assurance level and a
 * confidence in [0,1] plus a plain-English rationale. Shadow-asset detection is
 * a weighted correlation of several weak signals — deliberately NOT a single
 * keyword match — so the system can explain WHY it classified something.
 */

import type { Asset, Edge, Signal } from "@/lib/types";

const NONPROD_TOKENS: Array<{ token: RegExp; label: string; weight: number }> = [
  { token: /(^|[.-])staging([.-]|$)/, label: "staging", weight: 0.95 },
  { token: /(^|[.-])stage([.-]|$)/, label: "stage", weight: 0.8 },
  { token: /(^|[.-])(dev|develop|development)([.-]|$)/, label: "development", weight: 0.85 },
  { token: /(^|[.-])(test|testing)([.-]|$)/, label: "test", weight: 0.85 },
  { token: /(^|[.-])qa([.-]|$)/, label: "qa", weight: 0.85 },
  { token: /(^|[.-])uat([.-]|$)/, label: "uat", weight: 0.85 },
  { token: /(^|[.-])(demo|sandbox|preview)([.-]|$)/, label: "sandbox/preview", weight: 0.75 },
  { token: /(^|[.-])(beta|alpha)([.-]|$)/, label: "pre-release", weight: 0.6 },
];

const LEGACY_TOKENS: Array<{ token: RegExp; label: string; weight: number }> = [
  { token: /(^|[.-])(old|legacy|deprecated|archive|archived)([.-]|$)/, label: "legacy naming", weight: 0.9 },
  { token: /(^|[.-])(v1|v2|old2|new|new2|temp|tmp|bak|backup)([.-]|$)/, label: "versioned/temporary naming", weight: 0.55 },
  { token: /(^|[.-])(portal|intranet|internal)([.-]|$)/, label: "internal-style naming", weight: 0.5 },
];

const AUTH_TOKENS = /(^|[.-])(vpn|sso|login|auth|adfs|okta|owa|remote|citrix|rdp|gateway|portal|admin|dashboard|manage|cpanel|webmail)([.-]|$)/;
const API_TOKENS = /(^|[.-])(api|graphql|rest|grpc|gateway|svc|service|edge)([.-]|$)/;

export interface SignalContext {
  /** Hostnames referenced by the primary site's public navigation, if known. */
  linkedFromPrimary?: Set<string>;
  /** Number of graph edges touching this asset (isolation heuristic). */
  degreeById: Map<string, number>;
  now: string;
}

function match(list: typeof NONPROD_TOKENS, host: string) {
  return list.find((e) => e.token.test(host)) ?? null;
}

/** Environment classification (production vs non-production intent). */
export function environmentSignal(host: string): Signal | null {
  const m = match(NONPROD_TOKENS, host);
  if (!m) return null;
  return {
    code: "env.nonprod",
    label: `Possible non-production environment (${m.label})`,
    assurance: "inferred",
    confidence: m.weight,
    rationale: `Hostname contains a strong non-production naming token ("${m.label}"). Naming is an intent signal, not proof of environment.`,
  };
}

export function authSurfaceSignal(host: string): Signal | null {
  if (!AUTH_TOKENS.test(host)) return null;
  return {
    code: "surface.auth",
    label: "Public authentication surface indicator",
    assurance: "inferred",
    confidence: 0.7,
    rationale: "Hostname naming suggests a public login, remote-access, or administration surface.",
  };
}

export function apiSurfaceSignal(host: string): Signal | null {
  if (!API_TOKENS.test(host)) return null;
  return {
    code: "surface.api",
    label: "Public API surface indicator",
    assurance: "inferred",
    confidence: 0.65,
    rationale: "Hostname naming suggests a programmatic API endpoint.",
  };
}

/**
 * Shadow / forgotten-asset scoring. Correlates several weak signals:
 *  - non-production or legacy naming
 *  - absence from the primary site's public navigation
 *  - graph isolation (few relationships to the rest of the surface)
 *  - legacy technology indicators
 * Returns a signal only when the correlated score clears a threshold.
 */
export function shadowSignal(asset: Asset, ctx: SignalContext): Signal | null {
  const host = asset.canonical;
  const reasons: string[] = [];
  let score = 0;

  const legacy = match(LEGACY_TOKENS, host);
  if (legacy) {
    score += legacy.weight * 0.4;
    reasons.push(`legacy naming token ("${legacy.label}")`);
  }
  const nonprod = match(NONPROD_TOKENS, host);
  if (nonprod) {
    score += nonprod.weight * 0.28;
    reasons.push(`non-production naming ("${nonprod.label}")`);
  }
  if (ctx.linkedFromPrimary && !ctx.linkedFromPrimary.has(host)) {
    score += 0.28;
    reasons.push("no evidence of a link from the primary website");
  }
  const degree = ctx.degreeById.get(asset.id) ?? 0;
  if (degree <= 1) {
    score += 0.2;
    reasons.push("isolated position in the asset graph");
  }
  const tech = (asset.attrs.technologies as string[] | undefined) ?? [];
  if (tech.some((t) => /apache\/2\.2|php\/5|iis\/6|iis\/7|openssl\/1\.0/i.test(t))) {
    score += 0.25;
    reasons.push("outdated technology indicators");
  }

  const confidence = Math.min(0.97, score);
  if (confidence < 0.55) return null;

  return {
    code: "asset.shadow",
    label: "Possible shadow / unmanaged asset",
    assurance: "possible",
    confidence,
    rationale: `Correlated from: ${reasons.join("; ")}. Classification reflects likelihood of an unmanaged or forgotten asset, not confirmation.`,
  };
}

/** Assign a per-asset review priority from its signals. */
export function assetPriority(signals: Signal[]): Asset["priority"] {
  const has = (code: string) => signals.some((s) => s.code === code && s.confidence >= 0.6);
  if (has("asset.shadow") && has("surface.auth")) return "critical";
  if (has("asset.shadow")) return "high";
  if (has("env.nonprod")) return "high";
  if (has("surface.auth")) return "medium";
  if (has("surface.api")) return "medium";
  return signals.length ? "low" : "info";
}

export function detectAssetSignals(asset: Asset, edges: Edge[], ctx: SignalContext): Signal[] {
  const host = asset.canonical;
  const out: Signal[] = [];
  const env = environmentSignal(host);
  if (env) out.push(env);
  const auth = authSurfaceSignal(host);
  if (auth) out.push(auth);
  const api = apiSurfaceSignal(host);
  if (api) out.push(api);
  const shadow = shadowSignal(asset, ctx);
  if (shadow) out.push(shadow);
  return out;
}
