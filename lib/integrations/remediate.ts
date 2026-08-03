/**
 * Remediation orchestration over a connected provider. Safe-by-default: the one
 * auto-applicable action is adding a DMARC monitor-mode policy (p=none). It does
 * not block mail or claim to request reports without an explicit destination, and it is fully reversible via the
 * returned rollback handle. Every apply is previewed, applied, verified and
 * audited; a rollback removes exactly what was created.
 */

import { registrableDomain } from "@/lib/security/target";
import { operationalLog } from "@/lib/observability/log";
import { listZones, listDnsTxtRecords, createDnsTxt, deleteDnsRecord, verifyToken, type DnsRecordHandle } from "./cloudflare";

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
    summary: `Add a DMARC policy at _dmarc.${root} in monitor mode (p=none). It blocks no mail and requests no aggregate reports because no reporting destination is configured. It can be removed at any time.`,
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

  const existing = await listDnsTxtRecords(zone.id, preview.record.name, options.token);
  if (existing.some((record) => record.content.trim().toLowerCase().startsWith("v=dmarc1"))) {
    return {
      applied: false,
      verified: false,
      summary: `A DMARC policy already exists at ${preview.record.name}. OUTSIDE will not create a second policy record.`,
    };
  }

  const handle = await createDnsTxt(zone.id, preview.record.name, preview.record.content, options.token);
  const after = await listDnsTxtRecords(zone.id, preview.record.name, options.token);
  const verified = after.some((record) => record.id === handle.recordId && record.content === handle.content);
  if (!verified) {
    await deleteDnsRecord(handle, options.token).catch(() => {});
    return { applied: false, verified: false, summary: "Cloudflare did not return the created DMARC policy during verification; the change was rolled back." };
  }
  operationalLog("info", "integrations.remediation_applied", { connector: "cloudflare", action: preview.action, zone: root, recordId: handle.recordId, actorId: options.actorId ?? null });
  return { applied: true, verified, handle, summary: `Applied and verified: ${preview.summary}` };
}

/** Roll back a previously-applied remediation. */
export async function rollbackRemediation(handle: DnsRecordHandle, options: { token?: string; actorId?: string } = {}): Promise<boolean> {
  const ok = await deleteDnsRecord(handle, options.token);
  operationalLog("info", "integrations.remediation_rolled_back", { connector: "cloudflare", recordId: handle.recordId, actorId: options.actorId ?? null });
  return ok;
}
