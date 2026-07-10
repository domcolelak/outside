/**
 * Concrete remediation proposals + deterministic validation.
 *
 * Ported from Aegis AI's PatchProposal model: the system proposes the exact
 * change; a pure validator decides whether it is acceptable. Aegis AI required
 * every diff path to resolve inside the repository root and the declared
 * affected_files to cover the diff exactly. The OUTSIDE analog:
 *   - every hostname a proposal touches must resolve inside the target's
 *     registrable domain (the "root jail"), and
 *   - `affects` must cover exactly the hosts the proposal touches.
 * Nothing is ever auto-applied — proposals are previewed for human approval.
 */

import { registrableDomain } from "@/lib/security/target";
import type { ChangeProposal, ProposedDnsRecord, ProposedHeader } from "./types";

/** Response headers Aegis will propose, with safe defaults. */
const HEADER_DEFAULTS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const HEADER_ALLOWLIST = new Set(Object.keys(HEADER_DEFAULTS));

function hostInScope(host: string, reg: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === reg || h.endsWith("." + reg);
}

/**
 * Validate a proposal deterministically. Never throws — returns {ok, issues}.
 * The proposal object is returned with its `validation` field populated.
 */
export function validateChangeProposal(proposal: ChangeProposal, target: string): ChangeProposal {
  const reg = registrableDomain(target);
  const issues: string[] = [];

  // 1. Every touched host must be inside the target's registrable domain (root jail).
  const touched = new Set<string>();
  for (const r of proposal.dnsRecords ?? []) touched.add(r.name.toLowerCase().replace(/\.$/, ""));
  for (const host of proposal.affects) touched.add(host.toLowerCase().replace(/\.$/, ""));
  for (const host of touched) {
    if (!hostInScope(host, reg)) issues.push(`Out of scope: ${host} is not within ${reg}.`);
  }

  // 2. `affects` must cover exactly the hosts the proposal touches (declared coverage).
  const declared = new Set(proposal.affects.map((h) => h.toLowerCase().replace(/\.$/, "")));
  for (const r of proposal.dnsRecords ?? []) {
    const name = r.name.toLowerCase().replace(/\.$/, "");
    if (!declared.has(name)) issues.push(`DNS record for ${name} is not declared in "affects".`);
  }

  // 3. Format-specific sanity.
  for (const r of proposal.dnsRecords ?? []) {
    if (!r.value.trim()) issues.push(`Empty value for the ${r.type} record on ${r.name}.`);
    if (r.value.includes("\n")) issues.push(`Record value for ${r.name} must be a single line.`);
  }
  for (const h of proposal.headers ?? []) {
    if (!HEADER_ALLOWLIST.has(h.name)) issues.push(`Header ${h.name} is not on the safe allowlist.`);
    if (!h.value.trim()) issues.push(`Empty value for header ${h.name}.`);
  }

  return { ...proposal, autoApply: false, validation: { ok: issues.length === 0, issues } };
}

/** Concrete SPF + DMARC records for a mail-security recommendation. */
export function mailProposal(target: string): ChangeProposal {
  const reg = registrableDomain(target);
  const dnsRecords: ProposedDnsRecord[] = [
    { name: reg, type: "TXT", value: "v=spf1 include:_spf.your-mail-provider.com -all" },
    { name: `_dmarc.${reg}`, type: "TXT", value: `v=DMARC1; p=none; rua=mailto:dmarc@${reg}; fo=1` },
  ];
  return validateChangeProposal(
    {
      format: "dns_records",
      summary: "Publish these TXT records to establish SPF and a monitoring-mode DMARC policy. Replace the SPF include with your provider's, and enable DKIM at the provider.",
      dnsRecords,
      affects: [reg, `_dmarc.${reg}`],
      autoApply: false,
      validation: { ok: false, issues: [] },
    },
    target,
  );
}

/** Concrete header block for a security-headers recommendation. */
export function headerProposal(target: string, host: string, missing: string[]): ChangeProposal {
  // Map the human labels back to canonical header names.
  const wanted = missing
    .map((label) => Object.keys(HEADER_DEFAULTS).find((k) => label.includes(k)))
    .filter((k): k is string => !!k);
  const headers: ProposedHeader[] = (wanted.length ? wanted : Object.keys(HEADER_DEFAULTS)).map((name) => ({
    name,
    value: HEADER_DEFAULTS[name]!,
  }));
  return validateChangeProposal(
    {
      format: "http_headers",
      summary: `Add these response headers at your edge/CDN or web server for ${host}. Start Content-Security-Policy in report-only mode before enforcing.`,
      headers,
      affects: [host],
      autoApply: false,
      validation: { ok: false, issues: [] },
    },
    target,
  );
}
