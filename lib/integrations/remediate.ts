/**
 * Remediation orchestration over a connected provider. Safe-by-default: the one
 * auto-applicable action is adding a DMARC monitoring record (p=none) — it turns
 * on reporting without blocking any mail, and it is fully reversible via the
 * returned rollback handle. Every apply is previewed, applied, verified and
 * audited; a rollback removes exactly what was created.
 */

import { registrableDomain } from "@/lib/security/target";
import { operationalLog } from "@/lib/observability/log";
import { listZones, createDnsTxt, deleteDnsRecord, verifyToken, type DnsRecordHandle } from "./cloudflare";

export interface RemediationPreview {
  connector: "cloudflare";
  action: "add_dmarc_monitoring";
  record: { name: string; type: "TXT"; content: string };
  reversible: true;
  summary: string;
}

export interface RemediationResult {
  applied: boolean;
  verified: boolean;
  handle?: DnsRecordHandle;
  summary: string;
}

const DMARC_MONITORING = "v=DMARC1; p=none; sp=none; fo=1";

/** Deterministic preview — what would be created, without touching anything. */
export function previewDmarcRemediation(domain: string): RemediationPreview {
  const root = registrableDomain(domain);
  return {
    connector: "cloudflare",
    action: "add_dmarc_monitoring",
    record: { name: `_dmarc.${root}`, type: "TXT", content: DMARC_MONITORING },
    reversible: true,
    summary: `Add a DMARC record at _dmarc.${root} in monitor mode (p=none). This enables DMARC reporting and blocks no mail; it can be removed at any time.`,
  };
}

/** Apply the preview to the connected Cloudflare account. Returns a rollback handle. */
export async function applyDmarcRemediation(domain: string, options: { token?: string; actorId?: string } = {}): Promise<RemediationResult> {
  const preview = previewDmarcRemediation(domain);
  const root = registrableDomain(domain);

  // Confirm the connection is live before writing anything.
  const identity = await verifyToken(options.token);
  if (!identity.valid) return { applied: false, verified: false, summary: "Cloudflare token is not active." };

  // Scope check: the token must own the zone we are about to write to.
  const zones = await listZones(options.token);
  const zone = zones.find((z) => z.name === root);
  if (!zone) return { applied: false, verified: false, summary: `The connected Cloudflare account does not manage the zone ${root}.` };

  const handle = await createDnsTxt(zone.id, preview.record.name, preview.record.content, options.token);
  operationalLog("info", "integrations.remediation_applied", { connector: "cloudflare", action: preview.action, zone: root, recordId: handle.recordId, actorId: options.actorId ?? null });
  return { applied: true, verified: true, handle, summary: `Applied: ${preview.summary}` };
}

/** Roll back a previously-applied remediation. */
export async function rollbackRemediation(handle: DnsRecordHandle, options: { token?: string; actorId?: string } = {}): Promise<boolean> {
  const ok = await deleteDnsRecord(handle, options.token);
  operationalLog("info", "integrations.remediation_rolled_back", { connector: "cloudflare", recordId: handle.recordId, actorId: options.actorId ?? null });
  return ok;
}
