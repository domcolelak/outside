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

  const root = assets.find((asset) => asset.kind === "root_domain");
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
