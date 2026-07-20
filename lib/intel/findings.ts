/**
 * Findings derived from threat-intelligence enrichment attributes. Reads only
 * the flat attrs set by lib/intel/enrich.ts, so demo and anonymous scans (which
 * never carry those attrs) produce nothing here. Third-party inferences are
 * attributed to their source and never claim confirmed compromise.
 */

import type { Asset, Finding, Priority } from "@/lib/types";

/** Below this AbuseIPDB confidence score the signal is treated as noise. */
const IP_SCORE_FLOOR = 25;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fid(assetId: string, code: string): string {
  return `find_${assetId}_${code}`.replace(/[^a-z0-9_]/gi, "_");
}

export function generateIntelFindings(assets: Asset[], now: string): Finding[] {
  const out: Finding[] = [];

  for (const asset of assets) {
    const score = num(asset.attrs.threatIpScore);
    if (score < IP_SCORE_FLOOR) continue;
    const ip = typeof asset.attrs.threatIp === "string" ? asset.attrs.threatIp : "";
    const source = typeof asset.attrs.threatIpSource === "string" ? asset.attrs.threatIpSource : "a reputation provider";
    const reports = num(asset.attrs.threatIpReports);
    const lastReported = typeof asset.attrs.threatIpLastReported === "string" ? asset.attrs.threatIpLastReported : "";
    const priority: Priority = score >= 75 ? "high" : score >= 50 ? "medium" : "low";

    out.push({
      id: fid(asset.id, "threat_ip"),
      title: "Address with adverse reputation",
      priority,
      confidence: Math.min(0.75, 0.4 + score / 200),
      assetId: asset.id,
      category: "threat-intelligence",
      observation: `${asset.label} resolves to ${ip}, which ${source} scores at ${score}/100 abuse confidence${reports ? ` from ${reports} report(s)` : ""}${lastReported ? ` (last reported ${lastReported.slice(0, 10)})` : ""}.`,
      inference: "Adverse address reputation can indicate compromised hosting, malicious neighbours on shared infrastructure, or historical abuse from this address.",
      concern: `Reputation is about the address, not proof this service is malicious — the address may be shared hosting or previously abused and since reassigned. Treat it as a prioritized item to confirm against the hosting arrangement, not a confirmed compromise.`,
      reasoning: `Third-party reputation lookup of the resolved address against ${source}.`,
      recommendation: "Confirm the hosting arrangement and whether the address is dedicated to this organization. If dedicated, investigate for compromise or abuse originating from it; if shared, consider dedicated addressing for sensitive surfaces.",
      evidence: asset.evidence,
      discoveryMethod: "threat_intel",
      createdAt: now,
    });
  }

  // GreyNoise: the address this asset resolves to is itself generating malicious
  // internet-wide scan/attack traffic (RIOT-benign addresses are never flagged).
  for (const asset of assets) {
    if (asset.attrs.greynoiseClass !== "malicious") continue;
    const ip = typeof asset.attrs.greynoiseIp === "string" ? asset.attrs.greynoiseIp : "";
    const name = typeof asset.attrs.greynoiseName === "string" ? asset.attrs.greynoiseName : "";
    const lastSeen = typeof asset.attrs.greynoiseLastSeen === "string" ? asset.attrs.greynoiseLastSeen : "";
    out.push({
      id: fid(asset.id, "greynoise"),
      title: "Resolved address seen conducting malicious activity",
      priority: "medium",
      confidence: 0.6,
      assetId: asset.id,
      category: "threat-intelligence",
      observation: `${asset.label} resolves to ${ip}, which GreyNoise classifies as malicious${name ? ` (${name})` : ""} from observed internet-wide scanning${lastSeen ? ` (last seen ${lastSeen.slice(0, 10)})` : ""}.`,
      inference: "An address that GreyNoise sees scanning or attacking the internet, while also hosting this asset, can indicate compromised or abused shared infrastructure.",
      concern: "GreyNoise reports on the address's behaviour across the internet, not on this specific service. On shared hosting the noise may originate from a neighbour. Treat it as a prioritized item to confirm, not a confirmed compromise.",
      reasoning: "GreyNoise Community classification of the resolved address.",
      recommendation: "Confirm whether the address is dedicated to this organization. If dedicated, investigate the host for compromise or outbound abuse; if shared, move sensitive surfaces to dedicated addressing.",
      evidence: asset.evidence,
      discoveryMethod: "threat_intel",
      createdAt: now,
    });
  }

  const root = assets.find((asset) => asset.kind === "root_domain");

  // VirusTotal: aggregate security-vendor verdicts on the domain.
  const vtFlags = root ? num(root.attrs.vtMalicious) + num(root.attrs.vtSuspicious) : 0;
  if (root && vtFlags > 0) {
    const malicious = num(root.attrs.vtMalicious);
    const suspicious = num(root.attrs.vtSuspicious);
    const source = typeof root.attrs.vtSource === "string" ? root.attrs.vtSource : "VirusTotal";
    const priority: Priority = vtFlags >= 5 ? "high" : vtFlags >= 2 ? "medium" : "low";
    out.push({
      id: fid(root.id, "vt_reputation"),
      title: "Domain flagged by security vendors",
      priority,
      confidence: Math.min(0.7, 0.4 + vtFlags / 20),
      assetId: root.id,
      category: "threat-intelligence",
      observation: `${source} reports ${malicious} vendor(s) flagging ${root.label} as malicious${suspicious ? ` and ${suspicious} as suspicious` : ""}.`,
      inference: "Multiple independent security vendors flagging the domain can indicate malware distribution, phishing, or a prior compromise catalogued against it.",
      concern: "Vendor verdicts aggregate third-party opinion and can include false positives or stale detections from a past incident. Their value is prioritizing verification, not proving the domain is currently malicious.",
      reasoning: `Aggregate of security-vendor verdicts for the domain from ${source}.`,
      recommendation: "Review the flagging vendors' detections, check for defacement / injected content / open redirects, and request re-analysis or delisting once the domain is confirmed clean.",
      evidence: root.evidence,
      discoveryMethod: "threat_intel",
      createdAt: now,
    });
  }

  const breachCount = root ? num(root.attrs.breachCount) : 0;
  if (root && breachCount > 0) {
    const source = typeof root.attrs.breachSource === "string" ? root.attrs.breachSource : "a breach intelligence provider";
    const names = Array.isArray(root.attrs.breachNames) ? (root.attrs.breachNames as string[]) : [];
    const latest = typeof root.attrs.breachLatest === "string" ? root.attrs.breachLatest : "";
    out.push({
      id: fid(root.id, "breach_exposure"),
      title: "Organization appears in known data breaches",
      priority: "medium",
      confidence: 0.7,
      assetId: root.id,
      category: "breach-exposure",
      observation: `${source} records ${breachCount} public data breach(es) associated with ${root.label}${latest ? `, most recent dated ${latest}` : ""}${names.length ? `: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}` : ""}.`,
      inference: "Historical breaches raise the likelihood that employee or customer credentials for this domain have been exposed and may be reused against public login surfaces.",
      concern: "These are historical, publicly catalogued breaches — not evidence of a current compromise. Their value is prioritizing credential hygiene and monitoring of authentication surfaces.",
      reasoning: `Domain breach lookup against ${source}.`,
      recommendation: "Confirm affected accounts have rotated credentials, enforce MFA on authentication surfaces, and monitor for credential-stuffing against public login endpoints.",
      evidence: root.evidence,
      discoveryMethod: "threat_intel",
      createdAt: now,
    });
  }

  return out;
}
